/**
 * Midjourney / Suno 任务型渠道适配路由 — /v1/mj/* 与 /v1/suno/*
 *
 * 补齐 New API 特殊供应商适配（见 newapi-gap-analysis.md Batch 4，任务 4.1 遗留：
 * MJ/Suno 适配）。Midjourney / Suno 是任务型 API（提交任务 → 轮询任务状态），
 * 网关按渠道类型（suppliers.api_type = 'midjourney' / 'suno'）路由到上游
 * midjourney-proxy / suno-api 兼容服务，请求/响应体透传（对齐 New API
 * relay/mjproxy_handler.go 与 relay/channel/task/suno/adaptor.go 的端点约定）。
 *
 * 端点（对齐 New API 对外形态，挂 /v1 前缀与 3cloud OpenAI 兼容端点一致）：
 *   POST /v1/mj/submit/:action    — 提交 MJ 任务（imagine/describe/blend/change/...）
 *   GET  /v1/mj/task/:id/fetch    — 轮询 MJ 任务状态（不记账）
 *   POST /v1/suno/submit/:action  — 提交 Suno 任务（MUSIC / LYRICS）
 *   GET  /v1/suno/fetch/:id       — 轮询 Suno 任务状态（不记账）
 *   POST /v1/suno/fetch           — 批量轮询 Suno 任务状态（不记账）
 *
 * 计费约定（任务型 API 无 token 语义，按固定单价记账）：
 *   1 次任务 ≡ 1000 output tokens（TASK_BILLING_UNIT_TOKENS），
 *   即任务单价 = 任务模型的 outputPrice（¥/1K tokens 价 × 1）。
 *   计费模型名：MJ 按 action 映射（imagine→mj_imagine、describe→mj_describe、
 *   blend→mj_blend、change→mj_upscale、action→mj_variation、simple-change→mj_reroll、
 *   modal→mj_modal、shorten→mj_shorten，其余默认 mj_imagine）；
 *   Suno 按 action 映射（MUSIC→suno_music、LYRICS→suno_lyrics）。
 *   管理员通过给任务模型配置 vendor_pricing.outputPrice 控制每次任务单价。
 *   轮询端点（fetch）不记账。
 *
 * 转发/计费链路对齐 rerank.ts（无流式）：
 *   API Key Auth → Validate（action 必填 → 400）→ 余额预检(≤0 → 402)
 *   → selectTaskChannel（按 apiType，无可用 → mock 回退）→ proxy upstream（透传）
 *   → 记账（任务单价）→ 透传上游响应体
 *
 * 说明：本文件按 rerank.ts 等价实现私有 helper（settleBilling / getPricingForModel /
 * computeCost / sendOpenAIError 等），不改动既有文件行为。
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.1
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/task-relay
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { selectTaskChannel, type SelectedChannel } from '../services/upstream/routing';
import { getBalance, deductBalance } from '../services/billing/balance';
import { recordConsumption } from '../services/billing/consumption-log';
import { generateCommissionForConsumption } from '../services/agent/commission';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import type { PipelineContext } from '../services/pipeline/types';
import crypto from 'crypto';

// ============================================================
// 任务型计费约定
// ============================================================

/**
 * 任务计费单位：1 次任务按 1000 output tokens 计费（任务 API 无 token 语义）。
 * 目的：任务消费能在 consumption 统计/仪表盘中以 token 量呈现，且
 * 任务单价 = 模型 outputPrice（¥/1K tokens × 1），管理员配置直观。
 */
const TASK_BILLING_UNIT_TOKENS = 1000;

/** 默认单价（¥ / 1K tokens）——取不到 vendor_pricing 时兜底 */
const DEFAULT_INPUT_PRICE = 0.002;
const DEFAULT_OUTPUT_PRICE = 0.008;

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

/**
 * 查找模型定价（vendor_pricing × supplier_models），无则默认
 * （与 rerank.ts 等价实现）
 *
 * @param model - 计费模型名（如 mj_imagine / suno_music）
 * @returns { input, output } 单价（¥ / 1K tokens）
 */
async function getPricingForModel(model: string): Promise<{ input: number; output: number }> {
  try {
    const rows = await db.select({
      inputPrice: schema.vendorPricing.inputPrice,
      outputPrice: schema.vendorPricing.outputPrice,
    })
      .from(schema.vendorPricing)
      .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
      .where(eq(schema.supplierModels.modelName, model))
      .limit(1);

    if (rows.length > 0) {
      const input = Number(rows[0]!.inputPrice);
      const output = Number(rows[0]!.outputPrice);
      if (!isNaN(input) && !isNaN(output) && input > 0 && output > 0) {
        return { input, output };
      }
    }
  } catch {
    /* 定价查询失败 → 走默认价 */
  }
  return { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };
}

/**
 * 任务单价：1 次任务 = TASK_BILLING_UNIT_TOKENS 个 output tokens，
 * 即任务单价 = 模型 outputPrice（¥/次）。
 *
 * @param model - 计费模型名
 * @param pricing - 单价，缺省用默认价
 * @returns 单次任务费用（元）
 */
function computeTaskCost(model: string, pricing?: { input: number; output: number }): number {
  const p = pricing ?? { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };
  return (TASK_BILLING_UNIT_TOKENS / 1000) * p.output;
}

// ============================================================
// 记账与 mock 回退（与 rerank.ts 等价实现）
// ============================================================

/**
 * 记账 + 扣费 + 更新 key 最后调用时间（与 rerank.ts 的 settleBilling 等价）
 *
 * @param ctx - 流水线上下文
 * @param cost - 任务费用（¥）
 * @param channel - 选中的渠道；mock 回退时为 null
 * @param opts - 记账标记：fallback / errorCode
 */
async function settleBilling(
  ctx: PipelineContext,
  cost: number,
  channel: SelectedChannel | null,
  opts: { fallback: boolean; errorCode?: string },
): Promise<void> {
  await deductBalance(ctx.userId, cost.toFixed(8), 'consumption', ctx.requestId);

  const record = await recordConsumption({
    userId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    model: ctx.model,
    supplierId: channel?.supplier.id,
    supplierModelId: channel?.modelMapping.id || undefined,
    inputTokens: 0,
    outputTokens: TASK_BILLING_UNIT_TOKENS,
    cost: cost.toFixed(8),
    trustUpstream: !opts.fallback,
    fallback: opts.fallback,
    streamed: false,
    finishReason: 'stop',
    errorCode: opts.errorCode,
    requestId: ctx.requestId,
  });

  // 实时佣金结算（异步，不阻塞响应）；幂等由唯一索引保证
  if (record?.id) {
    void generateCommissionForConsumption({
      userId: ctx.userId,
      consumptionRecordId: record.id,
      cost: cost.toFixed(8),
    }).catch((e) => {
      console.error(`[task-relay] commission generation failed for consumption ${record.id}:`, e);
    });
  }

  // 更新 key 最后调用时间（非致命）
  if (ctx.apiKeyId) {
    await db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, ctx.apiKeyId))
      .catch(() => { /* 非致命 */ });
  }
}

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
 * 转发任务请求到上游（提交/轮询通用）
 *
 * @param apiType - 供应商 apiType（midjourney / suno）
 * @param path - 上游相对路径（如 /mj/submit/imagine）
 * @param method - HTTP 方法（POST / GET）
 * @param body - POST 请求体（GET 传 undefined）
 * @param keyValue - 上游 API Key
 * @param baseUrl - 供应商 baseUrl
 * @returns 上游 fetch Response
 */
function forwardTask(
  apiType: string,
  path: string,
  method: 'POST' | 'GET',
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
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
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
  // 提交任务（记账）：POST /v1/mj/submit/:action 与 POST /v1/suno/submit/:action
  // ═══════════════════════════════════════

  /**
   * 处理任务提交（MJ / Suno 共用）：鉴权 → 余额预检 → 选渠道 → 转发 → 记账
   */
  async function handleTaskSubmit(apiType: 'midjourney' | 'suno', request: any, reply: FastifyReply) {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    try {
      // 校验 action（在 try 内：AppError 走统一错误格式，而非 Fastify 默认错误体）
      const action = validateAction(request.params?.action);

      // action → 计费模型名
      const modelMap = apiType === 'midjourney' ? MJ_ACTION_MODEL : SUNO_ACTION_MODEL;
      const billModel = modelMap[action.toLowerCase()] ?? (apiType === 'midjourney' ? 'mj_imagine' : 'suno_music');

      const pipelineCtx: PipelineContext = {
        requestId: crypto.randomUUID(),
        userId: ctx?.userId ?? 0,
        apiKeyId: ctx?.apiKeyId ?? 0,
        model: billModel,
        body,
        stream: false,
        metadata: {},
      };

      // 1. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 2. Select task channel（无可用 → mock 回退）
      const channel = await selectTaskChannel(apiType, ctx?.userId ? { userId: ctx.userId } : undefined);
      const pricing = await getPricingForModel(billModel);
      const taskCost = computeTaskCost(billModel, pricing);

      if (!channel) {
        // ── mock 回退路径：返回占位任务 id，同样记账扣费 ──
        await settleBilling(pipelineCtx, taskCost, null, { fallback: true });

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
        'POST',
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

      // 4. 记账（任务单价）→ 透传上游响应体
      await settleBilling(pipelineCtx, taskCost, channel, { fallback: false });
      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);
      const rawBody = await upstreamResp.text();
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }
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
  // 轮询任务（不记账）：GET /v1/mj/task/:id/fetch、GET /v1/suno/fetch/:id、POST /v1/suno/fetch
  // ═══════════════════════════════════════

  /**
   * 处理任务轮询（MJ / Suno 共用）：鉴权 → 选渠道 → 转发上游（不记账、不扣费）
   *
   * 任务状态轮询是高频只读操作，按 New API 约定不计费；无可用渠道时返回 502
   * 而非 mock（没有任务 id 就没有占位意义）。
   */
  async function handleTaskFetch(apiType: 'midjourney' | 'suno', path: string, request: any, reply: FastifyReply) {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };

    try {
      const channel = await selectTaskChannel(apiType, ctx?.userId ? { userId: ctx.userId } : undefined);
      if (!channel) {
        return sendOpenAIError(reply, 502, `No available ${apiType} channel`, 'channel_unavailable', 502);
      }

      const upstreamResp = await forwardTask(
        apiType,
        path,
        'GET',
        undefined,
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

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', crypto.randomUUID());
      const rawBody = await upstreamResp.text();
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }
      return reply.send(parsedBody);
    } catch (err) {
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  }

  app.get('/v1/mj/task/:id/fetch', routeOptions, (request: any, reply: FastifyReply) => {
    const id = String(request.params?.id ?? '');
    return handleTaskFetch('midjourney', `/mj/task/${id}/fetch`, request, reply);
  });

  app.get('/v1/suno/fetch/:id', routeOptions, (request: any, reply: FastifyReply) => {
    const id = String(request.params?.id ?? '');
    return handleTaskFetch('suno', `/suno/fetch/${id}`, request, reply);
  });

  // Suno 批量轮询：POST /v1/suno/fetch（body: { ids: string[] }，透传上游）
  app.post('/v1/suno/fetch', routeOptions, async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };

    try {
      const channel = await selectTaskChannel('suno', ctx?.userId ? { userId: ctx.userId } : undefined);
      if (!channel) {
        return sendOpenAIError(reply, 502, 'No available suno channel', 'channel_unavailable', 502);
      }

      const upstreamResp = await forwardTask(
        'suno',
        '/suno/fetch',
        'POST',
        request.body ?? {},
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

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', crypto.randomUUID());
      const rawBody = await upstreamResp.text();
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }
      return reply.send(parsedBody);
    } catch (err) {
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  });
}
