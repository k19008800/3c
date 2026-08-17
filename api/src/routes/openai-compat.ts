/**
 * OpenAI 兼容端点路由 — /v1/embeddings、/v1/completions、/v1/models
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 1，Gate 1.3/1.4/1.5）。
 * 三个端点的转发/计费链路对齐 chat.ts（/v1/chat/completions）：
 *
 *   流式处理链路（P0-4 已改写为 pipeline steps）：
 *   auth → idempotency → rate-limit → validate → pre-consume → route → proxy → settle
 *
 * 说明：
 *   - auth / rate-limit 由 Fastify preHandler（apiKeyAuth / enforceRateLimitPreHandler）
 *     强制执行，pipeline 中对应 step 为链路声明 + 断言；
 *   - idempotency（P0-3）：获取锁失败（重复）→ 抛 IdempotencyConflictError → 路由回放首次结果；
 *     后续步骤失败 → rollback 释放锁（允许同一键重试）；
 *   - pre-consume（P0-1）：余额 > 阈值旁路，否则 Redis Lua 冻结；后续失败 → rollback 解冻；
 *   - proxy：上游转发（流式 streamRelay / 非流式读取），上游错误透传（UpstreamPassthroughError）；
 *   - settle：记账扣费（settleBilling 共享服务）+ 幂等响应缓存。
 *
 * 与 chat.ts 的差异：
 * - /v1/embeddings：无流式，上游路径 /v1/embeddings，只计输入 token
 * - /v1/completions：支持 stream（SSE 转发 + determineStreamBilling 结算），上游路径 /v1/completions
 * - /v1/models：从数据库读取真实可用模型（supplier_models × suppliers），查询失败兜底空数组
 *
 * 路由专属逻辑（校验、上游 body 构造、mock 构造、幂等响应缓存）放在路由本地步骤/hook 里，
 * 与 chat.ts 结构完全一致。
 *
 * @see docs/iteration-plan-v2.md P0-4
 * @see newapi-migration-guide.md §2.1-2.3（转发/计费对照）
 * @module routes/openai-compat
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { countTokens } from '../services/billing/token-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { parseAndDiscount } from '../services/billing/cache-billing';
import { resolveCacheDiscountRate } from '../services/billing/cache-discount';
import { getBalance } from '../services/billing/balance';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import {
  resolveIdempotencyKey,
  replayIdempotentRequest,
  cacheIdempotentResponse,
  isIdempotencyUniqueViolation,
  buildIdempotencySummary,
} from '../services/idempotency';
import {
  runPipeline,
  createStep,
  authStep,
  idempotencyStep,
  IdempotencyConflictError,
  rateLimitStep,
  preConsumeStep,
  routeStep,
  proxyStep,
  UpstreamPassthroughError,
  settleStep,
  readPreConsume,
  setStepResult,
  requireStepResult,
  getStepResult,
  STEP_KEYS,
  type MockStepResult,
} from '../services/pipeline';
import type { PipelineContext } from '../services/pipeline';
import type { SelectedChannel } from '../services/upstream/routing';
import { getPricingForModel, computeCost, computeEstimatedCost, buildPricingContext } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import { releasePreConsume } from '../services/billing/pre-consume';
import type { StreamState } from '../services/upstream/proxy';
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

/** getPricingForModel 返回的定价结构（validate step 写入共享存储，结算步骤读取） */
type ModelPricing = { input: number; output: number; cacheDiscountRate: number | null };

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
    const apiKeyContext = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键：consumption_records.request_id 与 Redis
    // 锁/缓存同键，L2 DB 唯一约束兜底才成立；客户端未传头时行为与旧版一致（随机 UUID）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());

    // Build pipeline context（request/reply 注入供 steps 使用；身份字段由 auth step 同步）
    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: apiKeyContext?.userId ?? 0,
      apiKeyId: apiKeyContext?.apiKeyId ?? 0,
      model: '',
      body: request.body as Record<string, unknown>,
      stream: false,
      metadata: {},
      request,
      reply,
    };
    setStepResult(pipelineCtx, STEP_KEYS.apiKeyContext, apiKeyContext);

    try {
      const result = await runPipeline(pipelineCtx, [
        // 1. auth — API Key 认证（preHandler 已执行；此处断言上下文就绪）
        authStep(),

        // 2. idempotency — 幂等锁（重复 → 回放；后续失败 → 回滚释放锁）
        idempotencyStep({ key: idemKey, isStream: false }),

        // 3. rate-limit — 四级限流（preHandler 已强制执行；链路声明）
        rateLimitStep(),

        // 4. validate — 校验 + token 计数 + 余额预检 + 定价 + 预估费用
        createStep('validate', async (c) => {
          // 1. Validate
          const req = validateEmbeddingsRequest(c.body);
          c.model = req.model;
          c.stream = false;

          // 2. Count input tokens
          const estimatedInputTokens = estimateInputTokens(req.input, req.model);
          setStepResult(c, STEP_KEYS.request, req);
          setStepResult(c, STEP_KEYS.estimatedInputTokens, estimatedInputTokens);

          // 3. 余额预检（0 余额直接 402，不浪费上游调用）
          const balance = await getBalance(c.userId);
          if (Number(balance.availableBalance || 0) <= 0) {
            throw new InsufficientBalanceError('0', '0');
          }
          setStepResult(c, STEP_KEYS.balance, balance);

          // 3.5 P0-1 定价 + 预估费用（供 pre-consume step 预扣与各结算分支复用）
          //     P2-1：传用户上下文（userId），L5 活动价 / L4 分组价 / L3 代理价按需惰性解析
          const pricing = await getPricingForModel(req.model, buildPricingContext(c.request));
          const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing);
          setStepResult(c, STEP_KEYS.pricing, pricing);
          setStepResult(c, STEP_KEYS.estimatedCost, estimatedCost);

          return req;
        }),

        // 5. pre-consume — 阈值旁路 + Redis Lua 冻结（失败 402；后续失败 → 回滚解冻）
        preConsumeStep(),

        // 6. route — 渠道选择（无可用 → proxy step 走 mock 回退）
        routeStep(),

        // 7. proxy — 上游转发（embeddings 无流式；上游错误透传）
        proxyStep({
          buildUpstreamRequest: async (c) => {
            const req = requireStepResult<EmbeddingsRequest>(c, STEP_KEYS.request);
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            const upstreamUrl = `${channel.supplier.baseUrl}/v1/embeddings`;
            const upstreamBody = { model: channel.modelMapping.platformModel, input: req.input };
            return {
              url: upstreamUrl,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channel.key.keyValue}`,
              },
              body: JSON.stringify(upstreamBody),
            };
          },
          mockFallback: async (c) => {
            const req = requireStepResult<EmbeddingsRequest>(c, STEP_KEYS.request);
            const estimatedInputTokens = requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);
            const mock = buildMockEmbeddings(req.model, req.input, estimatedInputTokens);
            return {
              payload: {
                object: 'list',
                data: mock.data,
                model: req.model,
                usage: mock.usage,
                mock: true,
              },
              content: '',
              // MockStepResult.usage 需要 completion_tokens（embeddings 语义为 0）；客户端 payload 保持 OpenAI embeddings 格式不变
              usage: {
                prompt_tokens: mock.usage.prompt_tokens,
                completion_tokens: 0,
                total_tokens: mock.usage.total_tokens,
              },
            };
          },
        }),

        // 8. settle — 记账扣费（mock/非流式两态）+ 幂等响应缓存
        settleStep({
          implement: async (c) => {
            const pricing = requireStepResult<ModelPricing>(c, STEP_KEYS.pricing);
            const mock = getStepResult<MockStepResult>(c, STEP_KEYS.mockResult);

            // ── mock 回退路径（无可用渠道，同样记账扣费）──
            if (mock) {
              const cost = computeCost(c.model, mock.usage.prompt_tokens, 0, pricing);

              await settleBilling(c, mock.usage.prompt_tokens, 0, cost, null, {
                streamed: false,
                trustUpstream: false,
                fallback: true,
                preConsume: readPreConsume(c),
              });

              // 幂等：缓存首次成功响应（非流式存完整 body）
              await cacheIdempotentResponse(c.requestId, {
                streamed: false,
                body: mock.payload,
                summary: buildIdempotencySummary({
                  requestId: c.requestId,
                  model: c.model,
                  inputTokens: mock.usage.prompt_tokens,
                  outputTokens: 0,
                  cost: cost.toFixed(8),
                  finishReason: null,
                  streamed: false,
                }),
              });
              return reply.send(mock.payload);
            }

            // ── 真实上游路径 ──
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);

            // ── 非流式：结算成功后再发送（保证扣费失败能返回 402）──
            const parsedBody = requireStepResult<Record<string, unknown>>(c, STEP_KEYS.parsedBody);
            const u = (parsedBody.usage || {}) as Record<string, unknown>;
            const promptTokens = Number(u.prompt_tokens) || 0;
            const totalTokens = Number(u.total_tokens) || 0;
            const hasUsage = totalTokens > 0;

            // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与旧 computeCost 完全一致（回归安全）
            // 折扣率 = 模型级 vendor_pricing.cache_discount_rate → 全局 billing.cache_hit_discount → 默认 0.1
            const discount = hasUsage ? parseAndDiscount(parsedBody.usage, pricing, await resolveCacheDiscountRate(pricing)) : null;
            const cost = discount ? discount.cost : computeCost(c.model, requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens), 0, pricing);

            await settleBilling(
              c,
              hasUsage ? promptTokens : requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens),
              0,
              cost,
              channel,
              {
                streamed: false,
                trustUpstream: hasUsage,
                fallback: !hasUsage,
                cacheHitTokens: discount?.cacheHitTokens,
                cacheDiscount: discount?.discountAmount,
                preConsume: readPreConsume(c),
              },
            );

            await recordChannelResult(`supplier:${channel.supplier.id}:key:${channel.key.id}`, true);
            reply.header('X-Request-Id', c.requestId);

            // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
            await cacheIdempotentResponse(c.requestId, {
              streamed: false,
              body: parsedBody,
              summary: buildIdempotencySummary({
                requestId: c.requestId,
                model: c.model,
                inputTokens: hasUsage ? promptTokens : requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens),
                outputTokens: 0,
                cost: cost.toFixed(8),
                finishReason: null,
                streamed: false,
              }),
            });
            return reply.send(parsedBody);
          },
        }),
      ]);

      if (!result.success) throw result.error;
    } catch (err) {
      // 幂等锁重复（L1 命中）：回放首次结果，不重复扣费
      if (err instanceof IdempotencyConflictError) {
        const replayed = await replayIdempotentRequest(reply, err.key, err.isStream);
        if (replayed) return reply;
        // 首次请求仍在处理中（无缓存、无消费记录）→ 409 幂等提示，而非 500
        return sendOpenAIError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict', 409);
      }

      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        return sendOpenAIError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict', 409);
      }

      // 上游 4xx/5xx：透传上游状态码 + 错误体（rollback 已自动解冻预扣 + 释放幂等锁）
      if (err instanceof UpstreamPassthroughError) {
        reply.status(err.statusCode || 502);
        reply.header('Content-Type', 'application/json');
        try {
          return reply.send(JSON.parse(err.upstreamBody));
        } catch {
          return sendOpenAIError(reply, err.statusCode || 502, `Upstream error: ${err.statusCode}`);
        }
      }

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
    const apiKeyContext = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const bodyAny = request.body as Record<string, unknown>;

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键（见 chat.ts 同款注释：保证 L2 DB 兜底同键）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());
    const isStreamRequest = bodyAny?.stream === true;

    // Build pipeline context（request/reply 注入供 steps 使用；身份字段由 auth step 同步）
    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: apiKeyContext?.userId ?? 0,
      apiKeyId: apiKeyContext?.apiKeyId ?? 0,
      model: '',
      body: bodyAny,
      stream: false,
      metadata: {},
      request,
      reply,
    };
    setStepResult(pipelineCtx, STEP_KEYS.apiKeyContext, apiKeyContext);

    try {
      const result = await runPipeline(pipelineCtx, [
        // 1. auth — API Key 认证（preHandler 已执行；此处断言上下文就绪）
        authStep(),

        // 2. idempotency — 幂等锁（重复 → 回放；后续失败 → 回滚释放锁）
        idempotencyStep({ key: idemKey, isStream: isStreamRequest }),

        // 3. rate-limit — 四级限流（preHandler 已强制执行；链路声明）
        rateLimitStep(),

        // 4. validate — 校验 + token 计数 + 余额预检 + 定价 + 预估费用
        createStep('validate', async (c) => {
          // 1. Validate
          const req = validateCompletionsRequest(c.body);
          const isStream = req.stream === true;
          c.model = req.model;
          c.stream = isStream;

          // 2. Count input tokens
          const estimatedInputTokens = estimateInputTokens(req.prompt, req.model);
          setStepResult(c, STEP_KEYS.request, req);
          setStepResult(c, STEP_KEYS.estimatedInputTokens, estimatedInputTokens);

          // 3. 余额预检（0 余额直接 402，不浪费上游调用）
          const balance = await getBalance(c.userId);
          if (Number(balance.availableBalance || 0) <= 0) {
            throw new InsufficientBalanceError('0', '0');
          }
          setStepResult(c, STEP_KEYS.balance, balance);

          // 3.5 P0-1 定价 + 预估费用（供 pre-consume step 预扣与各结算分支复用）
          //     P2-1：传用户上下文（userId），L5 活动价 / L4 分组价 / L3 代理价按需惰性解析
          const pricing = await getPricingForModel(req.model, buildPricingContext(c.request));
          const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, req.max_tokens);
          setStepResult(c, STEP_KEYS.pricing, pricing);
          setStepResult(c, STEP_KEYS.estimatedCost, estimatedCost);

          return req;
        }),

        // 5. pre-consume — 阈值旁路 + Redis Lua 冻结（失败 402；后续失败 → 回滚解冻）
        preConsumeStep(),

        // 6. route — 渠道选择（无可用 → proxy step 走 mock 回退）
        routeStep(),

        // 7. proxy — 上游转发（流式 streamRelay / 非流式读取；上游错误透传）
        proxyStep({
          buildUpstreamRequest: async (c) => {
            const req = requireStepResult<CompletionsRequest>(c, STEP_KEYS.request);
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            const upstreamUrl = `${channel.supplier.baseUrl}/v1/completions`;
            const upstreamBody = buildUpstreamCompletionsBody(req, channel.modelMapping.platformModel);
            return {
              url: upstreamUrl,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channel.key.keyValue}`,
              },
              body: JSON.stringify(upstreamBody),
            };
          },
          mockFallback: async (c) => {
            const req = requireStepResult<CompletionsRequest>(c, STEP_KEYS.request);
            const estimatedInputTokens = requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);
            const mock = buildMockCompletion(req.model, req.prompt, estimatedInputTokens);
            return {
              payload: {
                id: `cmpl-${c.requestId}`,
                object: 'text_completion',
                created: Math.floor(Date.now() / 1000),
                model: req.model,
                choices: [{ index: 0, text: mock.content, finish_reason: 'stop' }],
                usage: mock.usage,
                mock: true,
              },
              content: mock.content,
              usage: mock.usage,
            };
          },
        }),

        // 8. settle — 记账扣费（mock/流式/非流式三态）+ 幂等响应缓存
        settleStep({
          implement: async (c) => {
            const pricing = requireStepResult<ModelPricing>(c, STEP_KEYS.pricing);
            const mock = getStepResult<MockStepResult>(c, STEP_KEYS.mockResult);

            // ── mock 回退路径（无可用渠道，同样记账扣费）──
            if (mock) {
              const cost = computeCost(c.model, mock.usage.prompt_tokens, mock.usage.completion_tokens, pricing);

              await settleBilling(c, mock.usage.prompt_tokens, mock.usage.completion_tokens, cost, null, {
                streamed: c.stream,
                trustUpstream: false,
                fallback: true,
                finishReason: 'stop',
                preConsume: readPreConsume(c),
              });

              // 幂等：缓存首次成功响应（mock 非流式存完整 body，流式只存摘要）
              await cacheIdempotentResponse(c.requestId, {
                streamed: c.stream,
                ...(c.stream ? {} : { body: mock.payload }),
                summary: buildIdempotencySummary({
                  requestId: c.requestId,
                  model: c.model,
                  inputTokens: mock.usage.prompt_tokens,
                  outputTokens: mock.usage.completion_tokens,
                  cost: cost.toFixed(8),
                  finishReason: 'stop',
                  streamed: c.stream,
                }),
              });

              if (c.stream) {
                // 流式 mock：单帧 + [DONE]
                reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
                reply.raw.write(`data: ${JSON.stringify({ ...mock.payload, choices: [{ index: 0, text: mock.content, finish_reason: null }] })}\n\n`);
                reply.raw.write('data: [DONE]\n\n');
                reply.raw.end();
                return;
              }
              return reply.send(mock.payload);
            }

            // ── 真实上游路径 ──
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);

            // 流式：转发已在 proxy step 完成（streamRelay），此处结算
            if (c.stream) {
              const state = requireStepResult<StreamState>(c, STEP_KEYS.streamState);
              const billing = determineStreamBilling(state, false, requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens), c.model);
              const cost = computeCost(c.model, billing.promptTokens, billing.completionTokens, pricing);

              try {
                await settleBilling(
                  c,
                  billing.promptTokens,
                  billing.completionTokens,
                  cost,
                  channel,
                  { streamed: true, trustUpstream: billing.trustUpstream, fallback: billing.fallback, finishReason: state.finishReason ?? undefined, preConsume: readPreConsume(c) },
                );
                // 幂等：结算成功才缓存流式摘要（失败不缓存，避免回放未计费的"成功"）
                await cacheIdempotentResponse(c.requestId, {
                  streamed: true,
                  summary: buildIdempotencySummary({
                    requestId: c.requestId,
                    model: c.model,
                    inputTokens: billing.promptTokens,
                    outputTokens: billing.completionTokens,
                    cost: cost.toFixed(8),
                    finishReason: state.finishReason ?? undefined,
                    streamed: true,
                  }),
                });
              } catch (err) {
                // 流式已开始，无法改状态码；记账失败仅记录（余额不足属罕见竞态）。
                // 不解冻语义：手动解冻预扣（幂等，已结算则 no-op）；锁保留支持幂等回放。
                console.error(`[Completions] stream settle failed for ${c.requestId}:`, err);
                await releasePreConsume(c, readPreConsume(c)).catch(() => { /* 解冻失败有 TTL 兜底 */ });
              }
              return;
            }

            // ── 非流式：结算成功后再发送（保证扣费失败能返回 402）──
            const parsedBody = requireStepResult<Record<string, unknown>>(c, STEP_KEYS.parsedBody);
            const u = (parsedBody.usage || {}) as Record<string, unknown>;
            const promptTokens = Number(u.prompt_tokens) || 0;
            const completionTokens = Number(u.completion_tokens) || 0;
            const totalTokens = Number(u.total_tokens) || 0;
            const hasUsage = totalTokens > 0;

            // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与旧 computeCost 完全一致（回归安全）
            // 折扣率 = 模型级 vendor_pricing.cache_discount_rate → 全局 billing.cache_hit_discount → 默认 0.1
            const discount = hasUsage ? parseAndDiscount(parsedBody.usage, pricing, await resolveCacheDiscountRate(pricing)) : null;
            const cost = discount ? discount.cost : computeCost(c.model, requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens), 0, pricing);

            const choices = (parsedBody.choices as Array<{ finish_reason?: string }> | undefined);
            const finishReason = String(choices?.[0]?.finish_reason ?? 'stop');

            await settleBilling(
              c,
              hasUsage ? promptTokens : requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens),
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
                preConsume: readPreConsume(c),
              },
            );

            await recordChannelResult(`supplier:${channel.supplier.id}:key:${channel.key.id}`, true);
            reply.header('X-Request-Id', c.requestId);

            // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
            await cacheIdempotentResponse(c.requestId, {
              streamed: false,
              body: parsedBody,
              summary: buildIdempotencySummary({
                requestId: c.requestId,
                model: c.model,
                inputTokens: hasUsage ? promptTokens : requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens),
                outputTokens: hasUsage ? completionTokens : 0,
                cost: cost.toFixed(8),
                finishReason,
                streamed: false,
              }),
            });
            return reply.send(parsedBody);
          },
        }),
      ]);

      if (!result.success) throw result.error;
    } catch (err) {
      // 幂等锁重复（L1 命中）：回放首次结果，不重复扣费
      if (err instanceof IdempotencyConflictError) {
        const replayed = await replayIdempotentRequest(reply, err.key, err.isStream);
        if (replayed) return reply;
        // 首次请求仍在处理中（无缓存、无消费记录）→ 409 幂等提示，而非 500
        return sendOpenAIError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict', 409);
      }

      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        return sendOpenAIError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict', 409);
      }

      // 上游 4xx/5xx：透传上游状态码 + 错误体（rollback 已自动解冻预扣 + 释放幂等锁）
      if (err instanceof UpstreamPassthroughError) {
        reply.status(err.statusCode || 502);
        reply.header('Content-Type', 'application/json');
        try {
          return reply.send(JSON.parse(err.upstreamBody));
        } catch {
          return sendOpenAIError(reply, err.statusCode || 502, `Upstream error: ${err.statusCode}`);
        }
      }

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
