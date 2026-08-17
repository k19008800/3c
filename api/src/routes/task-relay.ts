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
 * 转发/计费链路：
 *   API Key Auth → Validate（action 必填 → 400）→ 余额预检(≤0 → 402)
 *   → 渠道解析（任务依赖动作 → 渠道锁定；否则 selectTaskChannel，无可用 → mock 回退）
 *   → proxy upstream（透传）→ 落库 task_records → 记账 → 透传上游响应体
 *
 * 说明：本文件按 rerank.ts 等价实现私有 helper（settleBilling / getPricingForModel /
 * computeTaskCost / sendOpenAIError 等），不改动既有文件行为。
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.1
 * @see services/task/task-store（任务持久化）
 * @see services/task/task-poller（后台轮询 + 退款）
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/task-relay
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
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
import type { PipelineContext } from '../services/pipeline/types';
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
 * 转发任务提交请求到上游
 *
 * @param apiType - 供应商 apiType（midjourney / suno）
 * @param path - 上游相对路径（如 /mj/submit/imagine）
 * @param body - 请求体
 * @param keyValue - 上游 API Key
 * @param baseUrl - 供应商 baseUrl
 * @returns 上游 fetch Response
 */
function forwardTask(
  apiType: string,
  path: string,
  body: unknown,
  keyValue: string,
  baseUrl: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${keyValue}`,
  };
  // Midjourney Proxy（novicezk/midjourney-proxy）以上游 Key 作为 mj-api-secret 头鉴权
  if (apiType === 'midjourney') {
    headers['mj-api-secret'] = keyValue;
  }
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
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
   * 处理任务提交（MJ / Suno 共用）：
   * 鉴权 → 余额预检 → 渠道解析（任务依赖动作渠道锁定 / selectTaskChannel）
   * → 转发 → 落库 task_records → 记账（记账失败删除记录补偿）→ 透传响应
   */
  async function handleTaskSubmit(apiType: 'midjourney' | 'suno', request: any, reply: FastifyReply) {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const userId = ctx?.userId ?? 0;

    try {
      // 校验 action（在 try 内：AppError 走统一错误格式，而非 Fastify 默认错误体）
      const action = validateAction(request.params?.action);

      // action → 计费模型名
      const modelMap = apiType === 'midjourney' ? MJ_ACTION_MODEL : SUNO_ACTION_MODEL;
      const billModel = modelMap[action.toLowerCase()] ?? (apiType === 'midjourney' ? 'mj_imagine' : 'suno_music');

      const pipelineCtx: PipelineContext = {
        requestId: crypto.randomUUID(),
        userId,
        apiKeyId: ctx?.apiKeyId ?? 0,
        model: billModel,
        body,
        stream: false,
        metadata: {},
      };

      // 1. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 2. 渠道解析：
      //    a) 任务依赖动作（change/simple-change/...）→ 按 body.taskId 定位原任务 → 渠道锁定
      //    b) 普通提交 → selectTaskChannel 按 apiType 选渠道
      const referencedTaskId = extractReferencedTaskId(action, body);
      let channel: SelectedChannel | null = null;
      if (referencedTaskId) {
        const originTask = await getTaskForUser('midjourney', referencedTaskId, userId);
        if (!originTask) {
          // 原任务不存在/非本人 → MJ 语义错误（HTTP 200 + code 4，与 New API 一致）
          return reply.send({ code: 4, description: 'task_no_found' });
        }
        const sup = await getSupplierWithKey(originTask.supplierId, originTask.channelKeyId);
        if (!sup) {
          return sendOpenAIError(reply, 502, 'Original channel unavailable', 'channel_unavailable', 502);
        }
        channel = toSelectedChannel(sup.supplier, sup.key, originTask.model);
      } else {
        channel = await selectTaskChannel(apiType, userId ? { userId } : undefined);
      }

      const pricing = await getPricingForModel(billModel);
      const taskCost = computeTaskCost(billModel, pricing);

      if (!channel) {
        // ── mock 回退路径：返回占位任务 id，同样记账扣费（不落库：mock 任务不可轮询）──
        await settleBilling(pipelineCtx, 0, TASK_BILLING_UNIT_TOKENS, taskCost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
        });

        if (apiType === 'midjourney') {
          return reply.send({
            code: 1,
            result: `mock-task-${pipelineCtx.requestId}`,
            description: `[3cloud 模拟响应] 模型 ${billModel} 无可用供应商，返回占位任务 id。`,
            properties: {},
            mock: true,
          });
        }
        return reply.send({
          code: 'success',
          message: '',
          data: `mock-task-${pipelineCtx.requestId}`,
          mock: true,
        });
      }

      // 3. 真实上游转发（透传请求体，路径按 action 拼接）
      const upstreamResp = await forwardTask(
        apiType,
        `/${apiType === 'midjourney' ? 'mj' : 'suno'}/submit/${action}`,
        body,
        channel.key.keyValue,
        channel.supplier.baseUrl,
      );

      const cbKey = `supplier:${channel.supplier.id}:key:${channel.key.id}`;

      if (!upstreamResp.ok) {
        await recordChannelResult(cbKey, false);
        let errorBody = '';
        try { errorBody = await upstreamResp.text(); } catch { /* ignore */ }
        reply.status(upstreamResp.status || 502);
        reply.header('Content-Type', 'application/json');
        try {
          return reply.send(JSON.parse(errorBody));
        } catch {
          return sendOpenAIError(reply, upstreamResp.status || 502, `Upstream error: ${upstreamResp.status}`);
        }
      }

      // 4. 解析上游响应；确定公开 id / 上游 id
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

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
        reply.header('X-Request-Id', pipelineCtx.requestId);
        return reply.send(parsedBody);
      }

      // 5. 先落库（任务持久化；落库失败 → 不记账直接透传，无孤儿任务）
      let task: TaskRecord;
      try {
        task = await createTaskRecord({
          taskType: apiType,
          publicId,
          upstreamId,
          userId,
          apiKeyId: ctx?.apiKeyId ?? null,
          supplierId: channel.supplier.id,
          channelKeyId: channel.key.id,
          action,
          model: billModel,
          prompt: (typeof body.prompt === 'string' ? body.prompt
            : typeof body.gpt_description_prompt === 'string' ? body.gpt_description_prompt : null)?.slice(0, 5000) ?? null,
          cost: taskCost.toFixed(8),
          requestId: pipelineCtx.requestId,
        });
      } catch (err) {
        console.error(`[task-relay] 任务落库失败 ${apiType}/${action}:`, err);
        reply.header('X-Request-Id', pipelineCtx.requestId);
        return reply.send(parsedBody);
      }

      // 6. 记账；失败 → 删除任务记录补偿（不留"已扣费但无法轮询"的孤儿任务）
      try {
        await settleBilling(pipelineCtx, 0, TASK_BILLING_UNIT_TOKENS, taskCost, channel, {
          streamed: false,
          trustUpstream: true,
          fallback: false,
          finishReason: 'stop',
        });
      } catch (err) {
        await deleteTaskRecord(task.id).catch(() => { /* 删除失败仅记录，见下 */ });
        throw err;
      }

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);
      return reply.send(parsedBody);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return sendOpenAIError(reply, 402, err.message, 'insufficient_balance', 402);
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
