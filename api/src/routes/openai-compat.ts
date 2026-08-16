/**
 * OpenAI 兼容端点路由 — /v1/embeddings、/v1/completions、/v1/models
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 1，Gate 1.3/1.4/1.5）。
 * 三个端点的转发/计费链路对齐 chat.ts（/v1/chat/completions）：
 *
 *   API Key Auth → Validate → Count Input Tokens → 余额预检(≤0 → 402)
 *   → Select Channel（无可用 → mock 回退）→ proxy upstream → Settle Billing
 *
 * 与 chat.ts 的差异：
 * - /v1/embeddings：无流式，上游路径 /v1/embeddings，只计输入 token
 * - /v1/completions：支持 stream（SSE 转发 + determineStreamBilling 结算），上游路径 /v1/completions
 * - /v1/models：从数据库读取真实可用模型（supplier_models × suppliers），查询失败兜底空数组
 *
 * 说明：chat.ts 内的私有 helper（settleBilling / getPricingForModel / sendOpenAIError 等）
 * 在本文件按等价逻辑重新实现，不改动 chat.ts 现有行为；后续可提取到共享 service 层统一维护。
 *
 * @see newapi-migration-guide.md §2.1-2.3（转发/计费对照）
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/openai-compat
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { streamRelay } from '../services/upstream/proxy';
import { countTokens } from '../services/billing/token-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { parseAndDiscount } from '../services/billing/cache-billing';
import { getBalance, deductBalance } from '../services/billing/balance';
import { recordConsumption } from '../services/billing/consumption-log';
import { generateCommissionForConsumption } from '../services/agent/commission';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import type { PipelineContext } from '../services/pipeline/types';
import crypto from 'crypto';

// ============================================================
// Types
// ============================================================

/** POST /v1/embeddings 请求体（OpenAI 兼容） */
interface EmbeddingsRequest {
  model: string;
  input: string | string[];
  [key: string]: unknown;
}

/** POST /v1/completions 请求体（OpenAI 兼容） */
interface CompletionsRequest {
  model: string;
  prompt: string | string[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

// ============================================================
// 计费常量与工具（与 chat.ts 等价实现）
// ============================================================

/** 默认单价（¥ / 1K tokens）——取不到 vendor_pricing 时兜底 */
const DEFAULT_INPUT_PRICE = 0.002;
const DEFAULT_OUTPUT_PRICE = 0.008;

/**
 * 查找模型定价（vendor_pricing × supplier_models），无则默认
 *
 * 定价查询失败或数据非法（NaN / ≤0）时静默回退默认价，不阻断主链路。
 *
 * @param model - 用户请求的模型名
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
 * 按 token 数与单价计算费用（¥）
 *
 * @param model - 模型名（当前仅用于保持签名与 chat.ts 一致，便于后续按模型差异化计价）
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 * @param pricing - 单价，缺省时用默认价
 * @returns 费用（元）
 */
function computeCost(model: string, inputTokens: number, outputTokens: number, pricing?: { input: number; output: number }): number {
  const p = pricing ?? { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

// ============================================================
// 校验与估算
// ============================================================

/**
 * 校验 /v1/embeddings 请求体
 *
 * @param body - 原始请求体
 * @returns 校验通过的请求体
 * @throws {AppError} 缺 model / 缺 input / input 类型非法 → 400 INVALID_REQUEST
 */
function validateEmbeddingsRequest(body: unknown): EmbeddingsRequest {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body is required', 400, 'INVALID_REQUEST');
  }

  const req = body as Record<string, unknown>;

  if (typeof req.model !== 'string' || !req.model) {
    throw new AppError('"model" is required', 400, 'INVALID_REQUEST');
  }

  // OpenAI 兼容：input 为 string，或非空 string 数组
  const input = req.input;
  const isValidInput = typeof input === 'string'
    || (Array.isArray(input) && input.length > 0 && input.every((item) => typeof item === 'string'));
  if (!isValidInput) {
    throw new AppError('"input" is required and must be a string or a non-empty array of strings', 400, 'INVALID_REQUEST');
  }

  return req as unknown as EmbeddingsRequest;
}

/**
 * 校验 /v1/completions 请求体
 *
 * @param body - 原始请求体
 * @returns 校验通过的请求体
 * @throws {AppError} 缺 model / 缺 prompt / prompt 类型非法 → 400 INVALID_REQUEST
 */
function validateCompletionsRequest(body: unknown): CompletionsRequest {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body is required', 400, 'INVALID_REQUEST');
  }

  const req = body as Record<string, unknown>;

  if (typeof req.model !== 'string' || !req.model) {
    throw new AppError('"model" is required', 400, 'INVALID_REQUEST');
  }

  // OpenAI 兼容：prompt 为 string，或非空 string 数组
  const prompt = req.prompt;
  const isValidPrompt = typeof prompt === 'string'
    || (Array.isArray(prompt) && prompt.length > 0 && prompt.every((item) => typeof item === 'string'));
  if (!isValidPrompt) {
    throw new AppError('"prompt" is required and must be a string or a non-empty array of strings', 400, 'INVALID_REQUEST');
  }

  return req as unknown as CompletionsRequest;
}

/**
 * 估算输入 token 数：字符串直接计数；数组逐项累加
 *
 * @param text - 输入文本或文本数组
 * @param model - 模型名（用于 tiktoken encoding 选择）
 * @returns token 数
 */
function estimateInputTokens(text: string | string[], model: string): number {
  if (typeof text === 'string') return countTokens(text, model);
  return text.reduce((sum, item) => sum + countTokens(item, model), 0);
}

// ============================================================
// 记账与 mock 回退（与 chat.ts 等价实现）
// ============================================================

/**
 * 记账 + 扣费 + 更新 key 最后调用时间（与 chat.ts 的 settleBilling 等价）
 *
 * 顺序：先 deductBalance 扣费 → recordConsumption 记消费 → 异步生成佣金 → 更新 key 时间。
 * 任何一步失败都向上抛出（由路由 catch 统一处理），保证不出现"响应成功但未记账"。
 *
 * @param ctx - 流水线上下文（含 userId / apiKeyId / requestId / model）
 * @param input - 输入 token 数
 * @param output - 输出 token 数
 * @param cost - 费用（¥）
 * @param channel - 选中的渠道；mock 回退时为 null
 * @param opts - 记账标记：streamed / trustUpstream / fallback / finishReason / errorCode / cacheHitTokens / cacheDiscount
 */
async function settleBilling(
  ctx: PipelineContext,
  input: number,
  output: number,
  cost: number,
  channel: SelectedChannel | null,
  opts: {
    streamed: boolean;
    trustUpstream: boolean;
    fallback: boolean;
    finishReason?: string;
    errorCode?: string;
    cacheHitTokens?: number;
    cacheDiscount?: number;
  },
): Promise<void> {
  await deductBalance(ctx.userId, cost.toFixed(8), 'consumption', ctx.requestId);

  const record = await recordConsumption({
    userId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    model: ctx.model,
    supplierId: channel?.supplier.id,
    supplierModelId: channel?.modelMapping.id,
    inputTokens: input,
    outputTokens: output,
    cost: cost.toFixed(8),
    trustUpstream: opts.trustUpstream,
    fallback: opts.fallback,
    streamed: opts.streamed,
    finishReason: opts.finishReason,
    errorCode: opts.errorCode,
    requestId: ctx.requestId,
    // 缓存命中打折信息：表无对应列时 recordConsumption 内部跳过，不报错
    cacheHitTokens: opts.cacheHitTokens,
    cacheDiscount: opts.cacheDiscount,
  });

  // 实时佣金结算（异步，不阻塞响应）：消费产生即结算；无代理绑定则内部跳过。
  // 幂等由 agent_commissions.consumption_record_id 唯一索引保证；进程崩溃由回填调度器自愈。
  if (record?.id) {
    void generateCommissionForConsumption({
      userId: ctx.userId,
      consumptionRecordId: record.id,
      cost: cost.toFixed(8),
    }).catch((e) => {
      console.error(`[openai-compat] commission generation failed for consumption ${record.id}:`, e);
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

/**
 * 生成确定性伪随机 embedding 向量（固定 1536 维，取值 [-1, 1)）
 *
 * 用 LCG 伪随机数生成器，种子由 model + index 决定，同一请求可复现。
 * 仅用于 mock 回退（无可用供应商时演示完整链路），不表示真实语义。
 *
 * @param model - 模型名（参与种子计算）
 * @param index - 输入项序号（参与种子计算，使多条输入向量不同）
 * @returns 1536 维向量
 */
function generateMockVector(model: string, index: number): number[] {
  const DIM = 1536;
  let seed = 0;
  for (let i = 0; i < model.length; i++) {
    seed = (seed * 31 + model.charCodeAt(i)) >>> 0;
  }
  seed = (seed * 31 + index) >>> 0;

  const vector: number[] = new Array(DIM);
  for (let i = 0; i < DIM; i++) {
    // LCG: 数值稳定的 32 位伪随机序列
    seed = (seed * 1664525 + 1013904223) >>> 0;
    vector[i] = ((seed >>> 8) % 2000) / 1000 - 1; // [-1, 1)
  }
  return vector;
}

/**
 * mock 回退：无可用供应商时返回占位 embedding，同样记账扣费
 *
 * @param model - 用户请求的模型名
 * @param input - 原始输入
 * @param inputTokens - 本地估算的输入 token 数（写入 usage）
 * @returns OpenAI 兼容的 embeddings 数据 + usage
 */
function buildMockEmbeddings(model: string, input: string | string[], inputTokens: number) {
  const texts = typeof input === 'string' ? [input] : input;
  const data = texts.map((_, index) => ({
    object: 'embedding',
    embedding: generateMockVector(model, index),
    index,
  }));
  return { data, usage: { prompt_tokens: inputTokens, total_tokens: inputTokens } };
}

/**
 * mock 回退：无可用供应商时返回占位 completion，同样记账扣费
 *
 * @param model - 用户请求的模型名
 * @param prompt - 原始 prompt
 * @param inputTokens - 本地估算的输入 token 数（写入 usage）
 * @returns 占位文本 + usage
 */
function buildMockCompletion(model: string, prompt: string | string[], inputTokens: number) {
  const promptText = typeof prompt === 'string'
    ? prompt.slice(0, 120)
    : (Array.isArray(prompt) && prompt.length > 0 ? prompt[0]!.slice(0, 120) : '（无 prompt）');
  const content = `[3cloud 模拟响应] 已收到请求（模型 ${model}）。当前环境未配置可用的供应商 Key，返回占位响应以演示完整计费链路。\n> ${promptText}\n\n配置真实供应商后即可返回模型真实输出。`;
  const outputTokens = countTokens(content, model);
  return {
    content,
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
  };
}

/** 统一 OpenAI 错误响应 */
function sendOpenAIError(reply: FastifyReply, status: number, message: string, type = 'upstream_error', code?: number) {
  return reply.status(status).send({
    error: { message, type, code: code ?? status },
  });
}

/** 构造 /v1/completions 上游请求体，model 映射为供应商平台模型名 */
function buildUpstreamCompletionsBody(req: CompletionsRequest, platformModel: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: platformModel,
    prompt: req.prompt,
    stream: req.stream ?? false,
  };
  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  return body;
}

/**
 * 查询可用模型列表：supplier_models(status='active') × suppliers(status='active')
 *
 * 按 platformModel, id 升序返回，保证同一 platformModel 多供应商时去重结果确定。
 *
 * @returns { platformModel, supplierName } 列表
 * @throws 数据库查询失败时向上抛出，由路由层兜底为空数组
 */
async function queryActiveModels(): Promise<Array<{ platformModel: string; supplierName: string }>> {
  return db.select({
    platformModel: schema.supplierModels.platformModel,
    supplierName: schema.suppliers.name,
  })
    .from(schema.supplierModels)
    .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
    .where(and(
      eq(schema.supplierModels.status, 'active'),
      eq(schema.suppliers.status, 'active'),
    ))
    .orderBy(schema.supplierModels.platformModel, schema.supplierModels.id);
}

// ============================================================
// Routes
// ============================================================

/**
 * 注册 OpenAI 兼容端点：/v1/embeddings、/v1/completions、/v1/models
 *
 * 每个端点的 preHandler 均挂 apiKeyAuth；转发类端点（embeddings/completions）带
 * 与 chat/completions 一致的 rateLimit 配置（按 keyHash 限流 60 次/分钟）。
 *
 * @param app - Fastify 实例
 */
export async function openaiCompatRoutes(app: FastifyInstance) {
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

  // ============================================================
  // POST /v1/embeddings
  // ============================================================
  app.post('/v1/embeddings', routeOptions, async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const pipelineCtx: PipelineContext = {
      requestId: crypto.randomUUID(),
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: request.body as Record<string, unknown>,
      stream: false,
      metadata: {},
    };

    try {
      // 1. 校验请求体
      const req = validateEmbeddingsRequest(request.body);
      pipelineCtx.model = req.model;

      // 2. 输入 token 估算
      const estimatedInputTokens = estimateInputTokens(req.input, req.model);

      // 3. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 4. Select channel（无可用 → mock 回退）
      const channel = await selectChannel(req.model);

      if (!channel) {
        // ── mock 回退路径：返回占位 embedding，同样记账扣费 ──
        const mock = buildMockEmbeddings(req.model, req.input, estimatedInputTokens);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, 0, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, 0, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
        });

        return reply.send({
          object: 'list',
          data: mock.data,
          model: req.model,
          usage: mock.usage,
          mock: true,
        });
      }

      // 5. 真实上游转发（embeddings 无流式）
      const upstreamUrl = `${channel.supplier.baseUrl}/v1/embeddings`;
      const upstreamBody = { model: channel.modelMapping.platformModel, input: req.input };

      const upstreamResp = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channel.key.keyValue}`,
        },
        body: JSON.stringify(upstreamBody),
      });

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

      // 非流式：先读 body → 结算 → 再返回（保证扣费失败能返回 402）
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

      const u = (parsedBody.usage || {}) as Record<string, unknown>;
      const promptTokens = Number(u.prompt_tokens) || 0;
      const totalTokens = Number(u.total_tokens) || 0;
      const hasUsage = totalTokens > 0;

      const pricing = await getPricingForModel(req.model);
      // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与旧 computeCost 完全一致（回归安全）
      const discount = hasUsage ? parseAndDiscount(parsedBody.usage, pricing) : null;
      const cost = discount ? discount.cost : computeCost(req.model, estimatedInputTokens, 0, pricing);

      await settleBilling(
        pipelineCtx,
        hasUsage ? promptTokens : estimatedInputTokens,
        0,
        cost,
        channel,
        {
          streamed: false,
          trustUpstream: hasUsage,
          fallback: !hasUsage,
          cacheHitTokens: discount?.cacheHitTokens,
          cacheDiscount: discount?.discountAmount,
        },
      );

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
  });

  // ============================================================
  // POST /v1/completions
  // ============================================================
  app.post('/v1/completions', routeOptions, async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const pipelineCtx: PipelineContext = {
      requestId: crypto.randomUUID(),
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: request.body as Record<string, unknown>,
      stream: false,
      metadata: {},
    };

    try {
      // 1. 校验请求体
      const req = validateCompletionsRequest(request.body);
      const isStream = req.stream === true;
      pipelineCtx.model = req.model;
      pipelineCtx.stream = isStream;

      // 2. 输入 token 估算
      const estimatedInputTokens = estimateInputTokens(req.prompt, req.model);

      // 3. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 4. Select channel（无可用 → mock 回退）
      const channel = await selectChannel(req.model);

      if (!channel) {
        // ── mock 回退路径：返回占位 completion，同样记账扣费 ──
        const mock = buildMockCompletion(req.model, req.prompt, estimatedInputTokens);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, mock.usage.completion_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, mock.usage.completion_tokens, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
        });

        const payload = {
          id: `cmpl-${pipelineCtx.requestId}`,
          object: 'text_completion',
          created: Math.floor(Date.now() / 1000),
          model: req.model,
          choices: [{ index: 0, text: mock.content, finish_reason: 'stop' }],
          usage: mock.usage,
          mock: true,
        };

        if (isStream) {
          // 流式 mock：单帧 + [DONE]
          reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
          reply.raw.write(`data: ${JSON.stringify({ ...payload, choices: [{ index: 0, text: mock.content, finish_reason: null }] })}\n\n`);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
          return;
        }
        return reply.send(payload);
      }

      // 5. 真实上游路径
      const upstreamUrl = `${channel.supplier.baseUrl}/v1/completions`;
      const upstreamBody = buildUpstreamCompletionsBody(req, channel.modelMapping.platformModel);

      const upstreamResp = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channel.key.keyValue}`,
        },
        body: JSON.stringify(upstreamBody),
      });

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

      if (isStream) {
        // ── SSE 流式：转发后结算 ──
        const state = await streamRelay(pipelineCtx, reply, upstreamResp);
        await recordChannelResult(cbKey, true);

        const billing = determineStreamBilling(state, false, estimatedInputTokens, req.model);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, billing.promptTokens, billing.completionTokens, pricing);

        try {
          await settleBilling(
            pipelineCtx,
            billing.promptTokens,
            billing.completionTokens,
            cost,
            channel,
            { streamed: true, trustUpstream: billing.trustUpstream, fallback: billing.fallback, finishReason: state.finishReason ?? undefined },
          );
        } catch (err) {
          // 流式已开始，无法改状态码；记账失败仅记录（余额不足属罕见竞态）
          console.error(`[Completions] stream settle failed for ${pipelineCtx.requestId}:`, err);
        }
        return;
      }

      // ── 非流式：先读 body → 结算 → 再返回（保证扣费失败能返回 402）──
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

      const u = (parsedBody.usage || {}) as Record<string, unknown>;
      const promptTokens = Number(u.prompt_tokens) || 0;
      const completionTokens = Number(u.completion_tokens) || 0;
      const totalTokens = Number(u.total_tokens) || 0;
      const hasUsage = totalTokens > 0;

      const pricing = await getPricingForModel(req.model);
      // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与旧 computeCost 完全一致（回归安全）
      const discount = hasUsage ? parseAndDiscount(parsedBody.usage, pricing) : null;
      const cost = discount ? discount.cost : computeCost(req.model, estimatedInputTokens, 0, pricing);

      const choices = (parsedBody.choices as Array<{ finish_reason?: string }> | undefined);
      const finishReason = String(choices?.[0]?.finish_reason ?? 'stop');

      await settleBilling(
        pipelineCtx,
        hasUsage ? promptTokens : estimatedInputTokens,
        hasUsage ? completionTokens : 0,
        cost,
        channel,
        {
          streamed: false,
          trustUpstream: hasUsage,
          fallback: !hasUsage,
          finishReason,
          cacheHitTokens: discount?.cacheHitTokens,
          cacheDiscount: discount?.discountAmount,
        },
      );

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
  });

  // ============================================================
  // GET /v1/models
  // ============================================================
  app.get('/v1/models', {
    preHandler: [apiKeyAuth],
  }, async (_request, reply) => {
    try {
      const rows = await queryActiveModels();
      // 去重：同一 platformModel 多个供应商只保留一个
      // （查询已按 platformModel, id 排序，保留的第一个即 id 最小的供应商）
      const seen = new Set<string>();
      const data: Array<{ id: string; object: string; owned_by: string }> = [];
      for (const row of rows) {
        if (seen.has(row.platformModel)) continue;
        seen.add(row.platformModel);
        data.push({ id: row.platformModel, object: 'model', owned_by: row.supplierName });
      }
      return reply.send({ object: 'list', data });
    } catch {
      // 数据库查询失败 → 兜底空数组，不 500
      return reply.send({ object: 'list', data: [] });
    }
  });
}
