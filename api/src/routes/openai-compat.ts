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
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { streamRelay } from '../services/upstream/proxy';
import { countTokens } from '../services/billing/token-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { parseAndDiscount } from '../services/billing/cache-billing';
import { getBalance } from '../services/billing/balance';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import {
  acquireIdempotencyLock,
  buildIdempotencySummary,
  cacheIdempotentResponse,
  isIdempotencyUniqueViolation,
  releaseIdempotencyLock,
  replayIdempotentRequest,
  resolveIdempotencyKey,
} from '../services/idempotency';
import type { PipelineContext } from '../services/pipeline/types';
import { getPricingForModel, computeCost, computeEstimatedCost } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import { preConsume, releasePreConsume, type PreConsumeResult } from '../services/billing/pre-consume';
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
// 校验与估算
// ============================================================

// 计费工具（getPricingForModel / computeCost / computeEstimatedCost / settleBilling）
// 已抽取至共享服务 services/billing/{pricing,settle}.ts（P0-1），本文件直接 import。
// @see docs/iteration-plan-v2.md P0-1 关键约束（8 处重复实现 → 共享服务）

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
// 记账与 mock 回退（计费工具已抽共享服务，见文件头注释）
// ============================================================

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
    preHandler: [apiKeyAuth, enforceRateLimitPreHandler],
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
  const embeddingsHandler = async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键（见 chat.ts 同款注释：保证 L2 DB 兜底同键）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());

    // L1: Redis SETNX 获取幂等锁；重复 → 回放首次结果（不重复扣费）
    const lock = await acquireIdempotencyLock(idemKey);
    if (lock.status === 'duplicate') {
      const replayed = await replayIdempotentRequest(reply, idemKey, false);
      if (replayed) return reply;
      // 首次请求仍在处理中（无缓存、无消费记录）→ 409 幂等提示，而非 500
      return sendOpenAIError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict', 409);
    }
    // Redis 降级（不可用）时 lockToken 为 null → 失败路径无可释放的锁
    const lockToken = lock.status === 'acquired' ? lock.token : null;

    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: request.body as Record<string, unknown>,
      stream: false,
      metadata: {},
    };

    // P0-1 预扣结果：转发前冻结（mode='frozen'），成功路径结算、失败路径解冻
    let pre: PreConsumeResult | null = null;

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

      // 3.5 P0-1 阈值旁路 + 预扣（预扣失败 402 / Redis 异常旁路降级，都不调上游）
      //     定价提前取一次，供预扣预估与各结算分支复用（与原多次查询结果一致）。
      const pricing = await getPricingForModel(req.model);
      const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing);
      pre = await preConsume(pipelineCtx, estimatedCost, { balance });

      // 4. Select channel（无可用 → mock 回退）
      //    传入 userId：渠道分组供给过滤（supplier.allowed_groups），见 newapi-gap-analysis.md Batch 4 遗留
      const channel = await selectChannel(req.model, ctx?.userId ? { userId: ctx.userId } : undefined);

      if (!channel) {
        // ── mock 回退路径：返回占位 embedding，同样记账扣费 ──
        const mock = buildMockEmbeddings(req.model, req.input, estimatedInputTokens);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, 0, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, 0, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          preConsume: pre,
        });

        // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
        const embeddingsPayload = {
          object: 'list',
          data: mock.data,
          model: req.model,
          usage: mock.usage,
          mock: true,
        };
        await cacheIdempotentResponse(idemKey, {
          streamed: false,
          body: embeddingsPayload,
          summary: buildIdempotencySummary({
            requestId: idemKey,
            model: req.model,
            inputTokens: mock.usage.prompt_tokens,
            outputTokens: 0,
            cost: cost.toFixed(8),
            finishReason: null,
            streamed: false,
          }),
        });
        return reply.send(embeddingsPayload);
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
        // P0-1：上游失败未结算 → 解冻预扣（防资金卡死）
        await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
        // 幂等：上游失败释放锁，允许客户端用同一键重试
        if (lockToken) {
          await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
        }
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
          preConsume: pre,
        },
      );

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);

      // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
      await cacheIdempotentResponse(idemKey, {
        streamed: false,
        body: parsedBody,
        summary: buildIdempotencySummary({
          requestId: idemKey,
          model: req.model,
          inputTokens: hasUsage ? promptTokens : estimatedInputTokens,
          outputTokens: 0,
          cost: cost.toFixed(8),
          finishReason: null,
          streamed: false,
        }),
      });
      return reply.send(parsedBody);
    } catch (err) {
      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        return sendOpenAIError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict', 409);
      }
      // 处理失败释放幂等锁，允许客户端用同一键重试（成功路径不释放，锁保留到 TTL）
      if (lockToken) {
        await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
      }
      // P0-1：异常路径解冻预扣（未结算时；幂等，已结算/已释放则 no-op）
      await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
      if (err instanceof InsufficientBalanceError) {
        return sendOpenAIError(reply, 402, err.message, 'insufficient_balance', 402);
      }
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  };

  app.post('/v1/embeddings', routeOptions, embeddingsHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/embeddings', routeOptions, embeddingsHandler);

  // ============================================================
  // POST /v1/completions
  // ============================================================
  const completionsHandler = async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键（见 chat.ts 同款注释：保证 L2 DB 兜底同键）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());
    const isStreamRequest = (request.body as Record<string, unknown>)?.stream === true;

    // L1: Redis SETNX 获取幂等锁；重复 → 回放首次结果（不重复扣费）
    const lock = await acquireIdempotencyLock(idemKey);
    if (lock.status === 'duplicate') {
      const replayed = await replayIdempotentRequest(reply, idemKey, isStreamRequest);
      if (replayed) return reply;
      // 首次请求仍在处理中（无缓存、无消费记录）→ 409 幂等提示，而非 500
      return sendOpenAIError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict', 409);
    }
    // Redis 降级（不可用）时 lockToken 为 null → 失败路径无可释放的锁
    const lockToken = lock.status === 'acquired' ? lock.token : null;

    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: request.body as Record<string, unknown>,
      stream: false,
      metadata: {},
    };

    // P0-1 预扣结果：转发前冻结（mode='frozen'），成功路径结算、失败路径解冻
    let pre: PreConsumeResult | null = null;

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

      // 3.5 P0-1 阈值旁路 + 预扣（预扣失败 402 / Redis 异常旁路降级，都不调上游）
      //     定价提前取一次，供预扣预估与各结算分支复用（与原多次查询结果一致）。
      const pricing = await getPricingForModel(req.model);
      const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, req.max_tokens);
      pre = await preConsume(pipelineCtx, estimatedCost, { balance });

      // 4. Select channel（无可用 → mock 回退）
      //    传入 userId：渠道分组供给过滤（supplier.allowed_groups），见 newapi-gap-analysis.md Batch 4 遗留
      const channel = await selectChannel(req.model, ctx?.userId ? { userId: ctx.userId } : undefined);

      if (!channel) {
        // ── mock 回退路径：返回占位 completion，同样记账扣费 ──
        const mock = buildMockCompletion(req.model, req.prompt, estimatedInputTokens);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, mock.usage.completion_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, mock.usage.completion_tokens, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
          preConsume: pre,
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

        // 幂等：缓存首次成功响应（mock 非流式存完整 body，流式只存摘要）
        await cacheIdempotentResponse(idemKey, {
          streamed: isStream,
          ...(isStream ? {} : { body: payload }),
          summary: buildIdempotencySummary({
            requestId: idemKey,
            model: req.model,
            inputTokens: mock.usage.prompt_tokens,
            outputTokens: mock.usage.completion_tokens,
            cost: cost.toFixed(8),
            finishReason: 'stop',
            streamed: isStream,
          }),
        });

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
        // P0-1：上游失败未结算 → 解冻预扣（防资金卡死）
        await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
        // 幂等：上游失败释放锁，允许客户端用同一键重试
        if (lockToken) {
          await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
        }
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
        const cost = computeCost(req.model, billing.promptTokens, billing.completionTokens, pricing);

        try {
          await settleBilling(
            pipelineCtx,
            billing.promptTokens,
            billing.completionTokens,
            cost,
            channel,
            { streamed: true, trustUpstream: billing.trustUpstream, fallback: billing.fallback, finishReason: state.finishReason ?? undefined, preConsume: pre },
          );
          // 幂等：结算成功才缓存流式摘要（失败不缓存，避免回放未计费的"成功"）
          await cacheIdempotentResponse(idemKey, {
            streamed: true,
            summary: buildIdempotencySummary({
              requestId: idemKey,
              model: req.model,
              inputTokens: billing.promptTokens,
              outputTokens: billing.completionTokens,
              cost: cost.toFixed(8),
              finishReason: state.finishReason ?? undefined,
              streamed: true,
            }),
          });
        } catch (err) {
          // 流式已开始，无法改状态码；记账失败仅记录（余额不足属罕见竞态）
          console.error(`[Completions] stream settle failed for ${pipelineCtx.requestId}:`, err);
          // P0-1：流式结算失败 → 解冻预扣（防资金卡死；幂等，已结算则 no-op）
          await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
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
          preConsume: pre,
        },
      );

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);

      // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
      await cacheIdempotentResponse(idemKey, {
        streamed: false,
        body: parsedBody,
        summary: buildIdempotencySummary({
          requestId: idemKey,
          model: req.model,
          inputTokens: hasUsage ? promptTokens : estimatedInputTokens,
          outputTokens: hasUsage ? completionTokens : 0,
          cost: cost.toFixed(8),
          finishReason,
          streamed: false,
        }),
      });
      return reply.send(parsedBody);
    } catch (err) {
      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        return sendOpenAIError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict', 409);
      }
      // 处理失败释放幂等锁，允许客户端用同一键重试（成功路径不释放，锁保留到 TTL）
      if (lockToken) {
        await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
      }
      // P0-1：异常路径解冻预扣（未结算时；幂等，已结算/已释放则 no-op）
      await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
      if (err instanceof InsufficientBalanceError) {
        return sendOpenAIError(reply, 402, err.message, 'insufficient_balance', 402);
      }
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  };

  app.post('/v1/completions', routeOptions, completionsHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/completions', routeOptions, completionsHandler);

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
