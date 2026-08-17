/**
 * Midjourney / Suno 任务型渠道适配路由 — /v1/mj/* 与 /v1/suno/*
 *
 * 补齐 New API 特殊供应商适配（见 newapi-gap-analysis.md Batch 4，任务 4.1 遗留：
 * MJ/Suno 适配 + 增强「任务落库 + 后台轮询」）。
 *
 * 端点（对齐 New API 对外形态，挂 /v1 前缀与 3cloud OpenAI 兼容端点一致）：
 *   POST /v1/mj/submit/:action    — 提交 MJ 任务（imagine/describe/blend/change/...）
 *   GET  /v1/mj/task/:id/fetch    — 查任务状态（本地 DB 服务，不转发上游）
 *   POST /v1/suno/submit/:action  — 提交 Suno 任务（MUSIC / LYRICS）
 *   GET  /v1/suno/fetch/:id       — 查单个任务状态（本地 DB 服务）
 *   POST /v1/suno/fetch           — 批量查任务状态（本地 DB 服务）
 *
 * 任务模型（对齐 New API RelayMidjourneySubmit / RelayTask）：
 * - 提交成功即落库 task_records（公开 id：MJ = 上游 result；Suno = task_<32hex>，
 *   上游 id 存 upstream_id），记账（任务单价），后台轮询器刷新进度
 * - 任务依赖动作（change/simple-change/action/modal/video/edits）按 body.taskId
 *   （或 simple-change content 尾 token）定位原任务 → 渠道锁定到原渠道执行
 * - fetch 全部走本地 DB（用户隔离），不转发上游；MJ 未找到返回 {code:4,
 *   description:"task_no_found"}（与 New API 一致，HTTP 200）；Suno 返回 data:null
 * - MJ 提交响应码改写：21/22（任务已存在/排队中）→ 1（已提交）
 *
 * 计费约定（任务型 API 无 token 语义，按固定单价记账）：
 *   1 次任务 ≡ 1000 output tokens（TASK_BILLING_UNIT_TOKENS），
 *   即任务单价 = 任务模型的 outputPrice（¥/1K tokens 价 × 1）。
 *   计费模型名：MJ 按 action 映射（imagine→mj_imagine、describe→mj_describe、
 *   blend→mj_blend、change→mj_upscale、action→mj_variation、simple-change→mj_reroll、
 *   modal→mj_modal、shorten→mj_shorten，其余默认 mj_imagine）；
 *   Suno 按 action 映射（MUSIC→suno_music、LYRICS→suno_lyrics）。
 *   管理员通过给任务模型配置 vendor_pricing.outputPrice 控制每次任务单价。
 *   任务失败/超时由轮询器退款（addBalance refund，自动冲销代理佣金）。
 *
 * 提交链路（P0-4 已改写为 pipeline steps）：
 *   auth → rate-limit → validate（action 校验 + 余额预检 ≤0 → 402）
 *   → route（任务依赖动作 → 渠道锁定；否则 selectTaskChannel；无可用 → mock 回退）
 *   → proxy（上游转发，透传错误；任务提交不转发上游响应体给客户端）
 *   → settle（落库 task_records → 记账任务单价 → 透传响应）
 *
 * ⚠️ task-relay 豁免（docs/iteration-plan-v2.md P0-1/P0-4）：
 *   - 不接入 pre-consume（任务单价固定 + 失败有轮询器退款，保留"余额预检 + 事后扣费"）；
 *   - 无幂等守卫（不接入 idempotency step，链路上不出现幂等锁）。
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.1
 * @see services/task/task-store（任务持久化）
 * @see services/task/task-poller（后台轮询 + 退款）
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/task-relay
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { apiKeyAuth } from '../services/auth/apikey';
import { selectTaskChannel, type SelectedChannel } from '../services/upstream/routing';
import {
  createTaskRecord,
  deleteTaskRecord,
  getTaskForUser,
  listTasksForUser,
  getSupplierWithKey,
  type TaskRecord,
} from '../services/task/task-store';
import { getBalance } from '../services/billing/balance';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import {
  runPipeline,
  createStep,
  authStep,
  rateLimitStep,
  proxyStep,
  UpstreamPassthroughError,
  settleStep,
  setStepResult,
  requireStepResult,
  getStepResult,
  STEP_KEYS,
  type MockStepResult,
} from '../services/pipeline';
import type { PipelineContext } from '../services/pipeline';
import { getPricingForModel, computeTaskCost, TASK_BILLING_UNIT_TOKENS } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import crypto from 'crypto';

// ============================================================
// 任务型计费约定
// ============================================================

// 任务计费单位 TASK_BILLING_UNIT_TOKENS 已随定价工具抽取至 services/billing/pricing.ts（P0-1）。
// 1 次任务按 1000 output tokens 计费（任务 API 无 token 语义），任务单价 = 模型 outputPrice。

/** MJ action → 计费模型名（对齐 New API constant/midjourney.go MidjourneyModel2Action 子集） */
const MJ_ACTION_MODEL: Record<string, string> = {
  imagine: 'mj_imagine',
  describe: 'mj_describe',
  blend: 'mj_blend',
  change: 'mj_upscale',
  action: 'mj_variation',
  'simple-change': 'mj_reroll',
  modal: 'mj_modal',
  shorten: 'mj_shorten',
  upload: 'mj_upload',
  edits: 'mj_edits',
  video: 'mj_video',
};

/** Suno action（大小写归一）→ 计费模型名 */
const SUNO_ACTION_MODEL: Record<string, string> = {
  music: 'suno_music',
  lyrics: 'suno_lyrics',
};

/** 任务依赖动作：作用于已存在任务，需渠道锁定到原渠道（对齐 New API） */
const TASK_DEPENDENT_ACTIONS = new Set(['change', 'simple-change', 'action', 'modal', 'video', 'edits']);

// ============================================================
// 任务 id / 状态工具
// ============================================================

/**
 * 生成 Suno 公开任务 id：task_<32hex>（对齐 New API model.GenerateTaskID）
 *
 * 上游 suno-api 返回的内部 task id 不直接暴露给客户端，
 * 网关生成公开 id 返回，upstream_id 仅内部轮询用。
 *
 * @returns 公开任务 id
 */
function generatePublicTaskId(): string {
  return `task_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * 从请求体提取被引用的任务 id（渠道锁定用）；无引用返回 null
 *
 * 规则：
 * - 非任务依赖动作 → null
 * - body.taskId / body.task_id（字符串）→ 直接使用
 * - simple-change：content "U2 123456" / "V1-4 123" / "r 123" 的尾 token
 *   （形如 id：纯数字或长度 ≥ 16），避免把 "U2" 这类动作缩写误判为任务 id
 *
 * @param action - MJ action
 * @param body - 请求体
 * @returns 被引用任务 id；无引用返回 null
 */
function extractReferencedTaskId(action: string, body: Record<string, unknown>): string | null {
  if (!TASK_DEPENDENT_ACTIONS.has(action)) return null;
  const direct = typeof body.taskId === 'string' && body.taskId
    ? body.taskId
    : (typeof body.task_id === 'string' && body.task_id ? body.task_id : null);
  if (direct) return direct;
  if (action === 'simple-change' && typeof body.content === 'string') {
    const parts = body.content.trim().split(/\s+/);
    const last = parts[parts.length - 1] ?? '';
    if (/^\d+$/.test(last) || last.length >= 16) return last;
  }
  return null;
}

/**
 * MJ 提交响应码改写：21/22（任务已存在/排队中）→ 1（已提交）
 * （对齐 New API relay/mjproxy_handler.go：code 21→1、22→1）
 *
 * @param body - 上游响应体（原地修改）
 */
function rewriteMjSubmitCode(body: unknown): void {
  if (body && typeof body === 'object') {
    const code = Number((body as Record<string, unknown>).code);
    if (code === 21 || code === 22) {
      (body as Record<string, unknown>).code = 1;
    }
  }
}

/** 内部状态 → MJ 客户端状态（novicezk 大写语义） */
const MJ_STATUS_MAP: Record<string, string> = {
  success: 'SUCCESS',
  failed: 'FAILURE',
  submitted: 'IN_PROGRESS',
  queueing: 'IN_PROGRESS',
  processing: 'IN_PROGRESS',
};

/**
 * 从任务记录构造 MJ fetch DTO（novicezk midjourney-proxy 兼容）
 *
 * 最近一次轮询存的完整上游 dto（imageUrl/buttons/videoUrl 等）合并进基础字段。
 *
 * @param task - 任务记录
 * @returns MidjourneyDto 形状的对象
 */
function buildMjFetchDto(task: TaskRecord): Record<string, unknown> {
  const status = MJ_STATUS_MAP[task.status] ?? 'IN_PROGRESS';
  const base: Record<string, unknown> = {
    id: task.publicId,
    action: task.action,
    prompt: task.prompt,
    status,
    progress: task.progress ?? (status === 'SUCCESS' ? '100%' : '0%'),
    failReason: task.failReason,
    submitTime: task.submitTime,
    startTime: task.startTime,
    finishTime: task.finishTime,
  };
  const polled = task.response && typeof task.response === 'object'
    ? task.response as Record<string, unknown>
    : {};
  return { ...base, ...polled };
}

/**
 * 从任务记录构造 Suno TaskDto（suno-api 兼容）
 *
 * @param task - 任务记录
 * @returns TaskDto 形状的对象
 */
function buildSunoTaskDto(task: TaskRecord): Record<string, unknown> {
  const polled = task.response && typeof task.response === 'object'
    ? task.response as Record<string, unknown>
    : {};
  return {
    task_id: task.publicId,
    action: task.action,
    status: task.status,
    fail_reason: task.failReason,
    submit_time: task.submitTime,
    start_time: task.startTime,
    finish_time: task.finishTime,
    ...polled,
  };
}

// ============================================================
// 定价与记账（已抽共享服务 services/billing/{pricing,settle}.ts，P0-1）
// ============================================================

// 任务型计费豁免预扣（docs/iteration-plan-v2.md P0-1）：任务单价固定（outputPrice）、
// 失败有退款（task-poller 退款 + 佣金冲销），保留"余额预检 + 事后扣费"，
// 仅切换为共享 pricing/settle（getPricingForModel / computeTaskCost / settleBilling）。

/** 统一 OpenAI 错误响应 */
function sendOpenAIError(reply: FastifyReply, status: number, message: string, type = 'upstream_error', code?: number) {
  return reply.status(status).send({
    error: { message, type, code: code ?? status },
  });
}

// ============================================================
// 请求校验与上游转发
// ============================================================

/** 校验任务 action 路径参数（非空字符串） */
function validateAction(action: string | undefined): string {
  const a = String(action ?? '').trim();
  if (!a) {
    throw new AppError('"action" is required in the path', 400, 'INVALID_REQUEST');
  }
  return a;
}

/**
 * 原任务不存在/非本人（渠道锁定失败）— MJ 语义错误
 *
 * 以 HTTP 200 + {code:4, description:"task_no_found"} 返回（与 New API 一致），
 * 不是 HTTP 错误，故不继承 AppError（避免被通用 AppError 映射吞掉）。
 */
class TaskNotFoundError extends Error {
  constructor() {
    super('task_no_found');
    this.name = 'TaskNotFoundError';
  }
}

/** validate step 输出：校验后的 action + 计费模型名（route/proxy/settle 步骤读取） */
interface TaskSubmitMeta {
  action: string;
  billModel: string;
}

/** 把 task-store 的 supplier/key 行包装成 SelectedChannel（渠道锁定用） */
function toSelectedChannel(
  supplier: { id: number; name: string; code: string; baseUrl: string; status: string },
  key: { id: number; supplierId: number; keyValue: string; name: string | null; status: string },
  model: string,
): SelectedChannel {
  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      code: supplier.code,
      baseUrl: supplier.baseUrl,
      status: supplier.status,
      healthStatus: null,
      allowedGroups: [],
    },
    key: {
      id: key.id,
      supplierId: key.supplierId,
      keyValue: key.keyValue,
      name: key.name,
      status: key.status,
      selectMode: 'single',
      priority: 0,
      currentBalance: null,
    },
    modelMapping: {
      id: 0,
      supplierId: supplier.id,
      modelName: model,
      platformModel: model,
      status: 'active',
    },
  };
}

// ============================================================
// Routes
// ============================================================

/**
 * 注册 Midjourney / Suno 任务型渠道适配端点
 *
 * preHandler 挂 apiKeyAuth；与 chat/completions 一致的 rateLimit 配置
 * （按 keyHash 限流 60 次/分钟）。
 *
 * @param app - Fastify 实例
 */
export async function taskRelayRoutes(app: FastifyInstance) {
  const routeOptions = {
    preHandler: [apiKeyAuth],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => req.apiKeyContext?.keyHash || req.ip,
      },
    },
  };

  // ═══════════════════════════════════════
  // 提交任务（记账 + 落库）：POST /v1/mj/submit/:action 与 POST /v1/suno/submit/:action
  // ═══════════════════════════════════════

  /**
   * 处理任务提交（MJ / Suno 共用）— P0-4 pipeline 步骤链：
   * auth → rate-limit → validate（action + 余额预检）→ route（渠道锁定/selectTaskChannel）
   * → proxy（上游转发）→ settle（落库 task_records + 记账任务单价 + 透传响应）。
   *
   * 豁免说明：task-relay 不接入 pre-consume / idempotency（docs/iteration-plan-v2.md P0-1：
   * 任务单价固定 + 失败有轮询器退款；P0-4：本路由无幂等守卫）。
   */
  async function handleTaskSubmit(apiType: 'midjourney' | 'suno', request: any, reply: FastifyReply) {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const userId = ctx?.userId ?? 0;

    // Build pipeline context（request/reply 注入供 steps 使用；身份字段由 auth step 同步；
    // model 由 validate step 填充为计费模型名；task-relay 无流式）
    const pipelineCtx: PipelineContext = {
      requestId: crypto.randomUUID(),
      userId,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body,
      stream: false,
      metadata: {},
      request,
      reply,
    };
    setStepResult(pipelineCtx, STEP_KEYS.apiKeyContext, ctx);

    try {
      const result = await runPipeline(pipelineCtx, [
        // 1. auth — API Key 认证（preHandler 已执行；此处断言上下文就绪）
        authStep(),

        // 2. rate-limit — 四级限流（链路声明；实际限流视 preHandler 挂载而定）
        rateLimitStep(),

        // 3. validate — 校验 action + 计费模型 + 余额预检（≤0 → 402，不浪费上游调用）
        createStep('validate', async (c) => {
          // 校验 action（在 step 内：AppError 走统一错误格式，而非 Fastify 默认错误体）
          const action = validateAction(request.params?.action);

          // action → 计费模型名
          const modelMap = apiType === 'midjourney' ? MJ_ACTION_MODEL : SUNO_ACTION_MODEL;
          const billModel = modelMap[action.toLowerCase()] ?? (apiType === 'midjourney' ? 'mj_imagine' : 'suno_music');
          c.model = billModel;
          setStepResult(c, STEP_KEYS.request, { action, billModel });

          // 余额预检（0 余额直接 402，不浪费上游调用）
          const balance = await getBalance(c.userId);
          if (Number(balance.availableBalance || 0) <= 0) {
            throw new InsufficientBalanceError('0', '0');
          }
          setStepResult(c, STEP_KEYS.balance, balance);
          return { action, billModel };
        }),

        // 4. route — 渠道解析：
        //    a) 任务依赖动作（change/simple-change/...）→ 按 body.taskId 定位原任务 → 渠道锁定
        //    b) 普通提交 → selectTaskChannel 按 apiType 选渠道
        //    无可用 → proxy step 走 mock 回退
        createStep('route', async (c) => {
          const { action } = requireStepResult<TaskSubmitMeta>(c, STEP_KEYS.request);
          const referencedTaskId = extractReferencedTaskId(action, c.body);
          let channel: SelectedChannel | null = null;
          if (referencedTaskId) {
            const originTask = await getTaskForUser('midjourney', referencedTaskId, c.userId);
            if (!originTask) {
              // 原任务不存在/非本人 → MJ 语义错误（HTTP 200 + code 4，与 New API 一致）
              throw new TaskNotFoundError();
            }
            const sup = await getSupplierWithKey(originTask.supplierId, originTask.channelKeyId);
            if (!sup) {
              throw new AppError('Original channel unavailable', 502, 'channel_unavailable');
            }
            channel = toSelectedChannel(sup.supplier, sup.key, originTask.model);
          } else {
            channel = await selectTaskChannel(apiType, c.userId ? { userId: c.userId } : undefined);
          }
          setStepResult(c, STEP_KEYS.channel, channel);
          return channel;
        }),

        // 5. proxy — 上游转发（任务提交不转发上游响应体给客户端；上游错误透传；无渠道 → mock 回退）
        proxyStep({
          buildUpstreamRequest: async (c) => {
            const { action } = requireStepResult<TaskSubmitMeta>(c, STEP_KEYS.request);
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${channel.key.keyValue}`,
            };
            // Midjourney Proxy（novicezk/midjourney-proxy）以上游 Key 作为 mj-api-secret 头鉴权
            if (apiType === 'midjourney') {
              headers['mj-api-secret'] = channel.key.keyValue;
            }
            return {
              url: `${channel.supplier.baseUrl}/${apiType === 'midjourney' ? 'mj' : 'suno'}/submit/${action}`,
              headers,
              body: JSON.stringify(c.body ?? {}),
            };
          },
          // mock 回退：无可用供应商 → 占位任务 id（保持原 mock 格式），同样记账扣费
          mockFallback: async (c) => {
            const { billModel } = requireStepResult<TaskSubmitMeta>(c, STEP_KEYS.request);
            if (apiType === 'midjourney') {
              return {
                payload: {
                  code: 1,
                  result: `mock-task-${c.requestId}`,
                  description: `[3cloud 模拟响应] 模型 ${billModel} 无可用供应商，返回占位任务 id。`,
                  properties: {},
                  mock: true,
                },
                content: '',
                usage: { prompt_tokens: 0, completion_tokens: TASK_BILLING_UNIT_TOKENS, total_tokens: TASK_BILLING_UNIT_TOKENS },
              };
            }
            return {
              payload: {
                code: 'success',
                message: '',
                data: `mock-task-${c.requestId}`,
                mock: true,
              },
              content: '',
              usage: { prompt_tokens: 0, completion_tokens: TASK_BILLING_UNIT_TOKENS, total_tokens: TASK_BILLING_UNIT_TOKENS },
            };
          },
        }),

        // 6. settle — 落库 task_records + 记账（任务单价）+ 透传响应（mock 路径不落库）
        settleStep({
          implement: async (c) => {
            const { action, billModel } = requireStepResult<TaskSubmitMeta>(c, STEP_KEYS.request);
            const mock = getStepResult<MockStepResult>(c, STEP_KEYS.mockResult);
            const pricing = await getPricingForModel(billModel);
            const taskCost = computeTaskCost(billModel, pricing);

            // ── mock 回退路径：返回占位任务 id，同样记账扣费（不落库：mock 任务不可轮询）──
            if (mock) {
              await settleBilling(c, 0, TASK_BILLING_UNIT_TOKENS, taskCost, null, {
                streamed: false,
                trustUpstream: false,
                fallback: true,
                finishReason: 'stop',
                preConsume: null,
              });
              return reply.send(mock.payload);
            }

            // ── 真实上游路径 ──
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            const parsedBody = requireStepResult<Record<string, unknown>>(c, STEP_KEYS.parsedBody);
            const cbKey = `supplier:${channel.supplier.id}:key:${channel.key.id}`;

            // 解析上游响应；确定公开 id / 上游 id
            let publicId: string | null;
            let upstreamId: string | null;
            if (apiType === 'midjourney') {
              rewriteMjSubmitCode(parsedBody);
              publicId = typeof parsedBody.result === 'string' && parsedBody.result ? parsedBody.result : null;
              upstreamId = publicId;
            } else {
              publicId = generatePublicTaskId();
              upstreamId = typeof parsedBody.data === 'string' && parsedBody.data ? parsedBody.data : null;
              // 返回给客户端的是网关公开 id（上游内部 id 不外泄）
              parsedBody.data = publicId;
            }

            if (!publicId) {
              // 上游未返回任务 id（如 MJ 业务错误码）→ 未创建任务，不记账不落库，透传上游响应
              reply.header('X-Request-Id', c.requestId);
              return reply.send(parsedBody);
            }

            // 先落库（任务持久化；落库失败 → 不记账直接透传，无孤儿任务）
            let task: TaskRecord;
            try {
              task = await createTaskRecord({
                taskType: apiType,
                publicId,
                upstreamId,
                userId: c.userId,
                apiKeyId: c.apiKeyId ?? null,
                supplierId: channel.supplier.id,
                channelKeyId: channel.key.id,
                action,
                model: billModel,
                prompt: (typeof c.body.prompt === 'string' ? c.body.prompt
                  : typeof c.body.gpt_description_prompt === 'string' ? c.body.gpt_description_prompt : null)?.slice(0, 5000) ?? null,
                cost: taskCost.toFixed(8),
                requestId: c.requestId,
              });
            } catch (err) {
              console.error(`[task-relay] 任务落库失败 ${apiType}/${action}:`, err);
              reply.header('X-Request-Id', c.requestId);
              return reply.send(parsedBody);
            }

            // 记账；失败 → 删除任务记录补偿（不留"已扣费但无法轮询"的孤儿任务）
            try {
              await settleBilling(c, 0, TASK_BILLING_UNIT_TOKENS, taskCost, channel, {
                streamed: false,
                trustUpstream: true,
                fallback: false,
                finishReason: 'stop',
                preConsume: null,
              });
            } catch (err) {
              await deleteTaskRecord(task.id).catch(() => { /* 删除失败仅记录，见下 */ });
              throw err;
            }

            await recordChannelResult(cbKey, true);
            reply.header('X-Request-Id', c.requestId);
            return reply.send(parsedBody);
          },
        }),
      ]);

      if (!result.success) throw result.error;
    } catch (err) {
      // 原任务不存在/非本人 → MJ 语义错误（HTTP 200 + code 4，与 New API 一致）
      if (err instanceof TaskNotFoundError) {
        return reply.send({ code: 4, description: 'task_no_found' });
      }
      if (err instanceof InsufficientBalanceError) {
        return sendOpenAIError(reply, 402, err.message, 'insufficient_balance', 402);
      }
      // 上游 4xx/5xx：透传上游状态码 + 错误体
      if (err instanceof UpstreamPassthroughError) {
        reply.status(err.statusCode || 502);
        reply.header('Content-Type', 'application/json');
        try {
          return reply.send(JSON.parse(err.upstreamBody));
        } catch {
          return sendOpenAIError(reply, err.statusCode || 502, `Upstream error: ${err.statusCode}`);
        }
      }
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  }

  app.post('/v1/mj/submit/:action', routeOptions, (request: any, reply: FastifyReply) =>
    handleTaskSubmit('midjourney', request, reply));
  app.post('/v1/suno/submit/:action', routeOptions, (request: any, reply: FastifyReply) =>
    handleTaskSubmit('suno', request, reply));

  // ═══════════════════════════════════════
  // 轮询任务状态（本地 DB 服务，不记账）：GET /v1/mj/task/:id/fetch、
  // GET /v1/suno/fetch/:id、POST /v1/suno/fetch
  // ═══════════════════════════════════════

  /**
   * 从本地 DB 服务单任务状态（用户隔离）。
   *
   * MJ：未找到 → {code:4, description:"task_no_found"}（HTTP 200，MJ 客户端语义）；
   * Suno：未找到 → {code:"success", data:null}（suno-api 语义）。
   * 任务状态由后台轮询器（task-poller.ts）刷新，fetch 不转发上游。
   */
  async function handleTaskFetch(apiType: 'midjourney' | 'suno', request: any, reply: FastifyReply) {
    const userId = (request as any).apiKeyContext?.userId ?? 0;
    try {
      const id = String(request.params?.id ?? '').trim();
      if (apiType === 'midjourney') {
        const task = await getTaskForUser('midjourney', id, userId);
        if (!task) return reply.send({ code: 4, description: 'task_no_found' });
        return reply.send(buildMjFetchDto(task));
      }
      const task = await getTaskForUser('suno', id, userId);
      return reply.send({ code: 'success', message: '', data: task ? buildSunoTaskDto(task) : null });
    } catch (err) {
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  }

  app.get('/v1/mj/task/:id/fetch', routeOptions, (request: any, reply: FastifyReply) =>
    handleTaskFetch('midjourney', request, reply));

  app.get('/v1/suno/fetch/:id', routeOptions, (request: any, reply: FastifyReply) =>
    handleTaskFetch('suno', request, reply));

  // Suno 批量轮询：POST /v1/suno/fetch（body: { ids: string[] }，本地 DB 服务）
  app.post('/v1/suno/fetch', routeOptions, async (request: any, reply: FastifyReply) => {
    const userId = (request as any).apiKeyContext?.userId ?? 0;
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(body.ids)
        ? body.ids.map((i) => String(i).trim()).filter(Boolean)
        : [];
      const tasks = await listTasksForUser('suno', ids, userId);
      return reply.send({ code: 'success', message: '', data: tasks.map(buildSunoTaskDto) });
    } catch (err) {
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  });
}
