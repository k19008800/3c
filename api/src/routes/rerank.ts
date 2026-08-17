/**
 * Rerank 重排序兼容端点路由 — POST /v1/rerank
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 4 任务 4.1"Rerank 先行"）。
 * Cohere 的 /v1/rerank 是 RAG 检索增强的事实标准（Jina AI 亦提供同名端点），
 * 请求体为 Cohere 兼容格式：{ model, query, documents, top_n?, return_documents? }。
 *
 * 完整转发/计费链路（P0-4 已改写为 pipeline steps，对齐 chat.ts 结构）：
 *
 *   auth → idempotency → rate-limit → validate → pre-consume → route → proxy → settle
 *
 * 说明：
 *   - auth / rate-limit 由 Fastify preHandler（apiKeyAuth / enforceRateLimitPreHandler）
 *     强制执行，pipeline 中对应 step 为链路声明 + 断言；
 *   - idempotency（P0-3）：获取锁失败（重复）→ 抛 IdempotencyConflictError → 路由回放首次结果；
 *     后续步骤失败 → rollback 释放锁（允许同一键重试）；
 *   - validate：校验（model/query/documents 必填 → 400）+ 输入 token 估算
 *     （query + documents 文本 countTokens 求和）+ 余额预检(≤0 → 402) + 定价/预估费用写入存储；
 *   - pre-consume（P0-1）：余额 > 阈值旁路，否则 Redis Lua 冻结；后续失败 → rollback 解冻；
 *   - route：渠道选择（无可用 → proxy step 走 mock 回退）；
 *   - proxy：上游转发（非流式读取，上游透传 Cohere 格式 /v1/rerank），上游错误透传
 *     （UpstreamPassthroughError，rollback 自动解冻预扣 + 释放幂等锁）；
 *   - settle：非流式记账扣费（从 usage 计费，无 usage 用本地估算，
 *     trustUpstream/fallback 与 chat.ts 一致）+ 幂等响应缓存 + 发送。
 *
 * 与 openai-compat.ts 的差异：
 * - 输入为 query + documents（而非 input/prompt），token 估算两者求和
 * - 上游响应 usage 常见只有 total_tokens（Cohere/Jina rerank），prompt_tokens 缺失时
 *   以 total_tokens 视为输入 token 计费（详见计费段注释）
 * - 记账：streamed=false；model 用用户请求模型；透传 cacheHitTokens/cacheDiscount
 *   （parseAndDiscount 处理，接入方式同 messages.ts）
 *
 * 说明：rerank 无流式（stream 恒 false）；本文件不保留 trace/finally 留痕
 * （原实现即无对话留痕，仅保留 X-Request-Id 与错误映射）。
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.1
 * @see docs/iteration-plan-v2.md P0-4
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/rerank
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { countTokens } from '../services/billing/token-counter';
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
import { getPricingForModel, computeCost, computeEstimatedCost } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import crypto from 'crypto';

// ============================================================
// Types
// ============================================================

/**
 * POST /v1/rerank 请求体（Cohere 兼容）
 *
 * documents 元素允许 string 或 { text: string } 对象（Cohere 两种写法均支持）。
 */
interface RerankRequest {
  model: string;
  query: string;
  documents: Array<string | { text: string }>;
  top_n?: number;
  return_documents?: boolean;
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
 * 校验 /v1/rerank 请求体
 *
 * @param body - 原始请求体
 * @returns 校验通过的请求体
 * @throws {AppError} 缺 model / 缺 query / 缺 documents（或类型非法）→ 400 INVALID_REQUEST
 */
function validateRerankRequest(body: unknown): RerankRequest {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body is required', 400, 'INVALID_REQUEST');
  }

  const req = body as Record<string, unknown>;

  if (typeof req.model !== 'string' || !req.model) {
    throw new AppError('"model" is required', 400, 'INVALID_REQUEST');
  }

  if (typeof req.query !== 'string' || !req.query) {
    throw new AppError('"query" is required', 400, 'INVALID_REQUEST');
  }

  // Cohere 兼容：documents 为非空数组，元素为 string 或 { text: string }
  const documents = req.documents;
  const isValidDocuments = Array.isArray(documents)
    && documents.length > 0
    && documents.every((doc) => typeof doc === 'string'
      || (doc !== null && typeof doc === 'object' && typeof (doc as { text?: unknown }).text === 'string'));
  if (!isValidDocuments) {
    throw new AppError('"documents" is required and must be a non-empty array of strings or { text: string } objects', 400, 'INVALID_REQUEST');
  }

  return req as unknown as RerankRequest;
}

/**
 * 估算 rerank 输入 token 数：query + 全部 documents 文本逐项 countTokens 求和
 *
 * @param query - 检索 query 文本
 * @param documents - 文档列表（string 或 { text } 对象）
 * @param model - 模型名（用于 tiktoken encoding 选择）
 * @returns token 数
 */
function estimateRerankInputTokens(query: string, documents: Array<string | { text: string }>, model: string): number {
  let total = countTokens(query, model);
  for (const doc of documents) {
    total += countTokens(typeof doc === 'string' ? doc : doc.text, model);
  }
  return total;
}

// ============================================================
// 记账与 mock 回退（计费工具已抽共享服务，见文件头注释）
// ============================================================

/**
 * mock 回退：无可用供应商时返回按原文顺序的占位 rerank 结果，同样记账扣费
 *
 * 每个 document 生成一个 result：{ index, relevance_score: 0.5, document? }。
 * document 字段仅当 return_documents=true 时内嵌原文（与 Cohere 语义一致）。
 *
 * @param req - 校验通过的请求体（取 documents / return_documents）
 * @param inputTokens - 本地估算的输入 token 数（写入 usage）
 * @returns { results, usage } 占位结果 + usage
 */
function buildMockRerankResults(req: RerankRequest, inputTokens: number) {
  const results: Array<{ index: number; relevance_score: number; document?: { text: string } }> =
    req.documents.map((doc, index) => {
      const item: { index: number; relevance_score: number; document?: { text: string } } = {
        index,
        relevance_score: 0.5,
      };
      if (req.return_documents === true) {
        item.document = { text: typeof doc === 'string' ? doc : doc.text };
      }
      return item;
    });

  return {
    results,
    usage: { prompt_tokens: inputTokens, total_tokens: inputTokens },
  };
}

/** 统一 OpenAI 错误响应 */
function sendOpenAIError(reply: FastifyReply, status: number, message: string, type = 'upstream_error', code?: number) {
  return reply.status(status).send({
    error: { message, type, code: code ?? status },
  });
}

/** 构造 /v1/rerank 上游请求体，model 映射为供应商平台模型名，其余字段透传 */
function buildUpstreamRerankBody(req: RerankRequest, platformModel: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: platformModel,
    query: req.query,
    documents: req.documents,
  };
  if (req.top_n !== undefined) body.top_n = req.top_n;
  if (req.return_documents !== undefined) body.return_documents = req.return_documents;
  return body;
}

// ============================================================
// Routes
// ============================================================

/**
 * 注册 Rerank 兼容端点：POST /v1/rerank
 *
 * preHandler 挂 apiKeyAuth + enforceRateLimitPreHandler；转发类端点带与 chat/completions
 * 一致的 rateLimit 配置（按 keyHash 限流 60 次/分钟）。
 *
 * @param app - Fastify 实例
 */
export async function rerankRoutes(app: FastifyInstance) {
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
  // POST /v1/rerank
  // ============================================================
  const rerankHandler = async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键（见 chat.ts 同款注释：保证 L2 DB 兜底同键）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());

    // Build pipeline context（request/reply 注入供 steps 使用；身份字段由 auth step 同步；
    // model/stream 由 validate step 填充；rerank 无流式，stream 恒 false）
    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: request.body as Record<string, unknown>,
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

        // 2. idempotency — 幂等锁（重复 → 回放首次结果；后续失败 → 回滚释放锁；rerank 无流式）
        idempotencyStep({ key: idemKey, isStream: false }),

        // 3. rate-limit — 四级限流（preHandler 已强制执行；链路声明）
        rateLimitStep(),

        // 4. validate — 校验 + token 计数 + 余额预检 + 定价/预估费用写入存储
        createStep('validate', async (c) => {
          // 1. Validate
          const req = validateRerankRequest(c.body);
          c.model = req.model;
          c.stream = false; // rerank 无流式

          // 2. Count input tokens（query + documents）
          const estimatedInputTokens = estimateRerankInputTokens(req.query, req.documents, req.model);
          setStepResult(c, STEP_KEYS.request, req);
          setStepResult(c, STEP_KEYS.estimatedInputTokens, estimatedInputTokens);

          // 3. 余额预检（0 余额直接 402，不浪费上游调用）
          const balance = await getBalance(c.userId);
          if (Number(balance.availableBalance || 0) <= 0) {
            throw new InsufficientBalanceError('0', '0');
          }
          setStepResult(c, STEP_KEYS.balance, balance);

          // 3.5 P0-1 定价 + 预估费用（供 pre-consume step 预扣与结算分支复用）
          const pricing = await getPricingForModel(req.model);
          const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing);
          setStepResult(c, STEP_KEYS.pricing, pricing);
          setStepResult(c, STEP_KEYS.estimatedCost, estimatedCost);

          return req;
        }),

        // 5. pre-consume — 阈值旁路 + Redis Lua 冻结（失败 402；后续失败 → 回滚解冻）
        preConsumeStep(),

        // 6. route — 渠道选择（无可用 → proxy step 走 mock 回退）
        routeStep(),

        // 7. proxy — 上游转发（非流式读取；上游错误透传；无渠道 → mock 回退）
        proxyStep({
          buildUpstreamRequest: async (c) => {
            const req = requireStepResult<RerankRequest>(c, STEP_KEYS.request);
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            return {
              url: `${channel.supplier.baseUrl}/v1/rerank`,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channel.key.keyValue}`,
              },
              body: JSON.stringify(buildUpstreamRerankBody(req, channel.modelMapping.platformModel)),
            };
          },
          // mock 回退：无可用供应商 → 占位 rerank 结果（保持原 mock 格式），同样记账扣费
          mockFallback: async (c) => {
            const req = requireStepResult<RerankRequest>(c, STEP_KEYS.request);
            const estimatedInputTokens = requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);
            const mock = buildMockRerankResults(req, estimatedInputTokens);
            return {
              payload: {
                id: `rerank-${c.requestId}`,
                results: mock.results,
                model: req.model,
                usage: mock.usage,
                mock: true,
              },
              content: '',
              usage: { prompt_tokens: mock.usage.prompt_tokens, completion_tokens: 0, total_tokens: mock.usage.total_tokens },
            };
          },
        }),

        // 8. settle — 记账扣费（mock/非流式两态）+ 幂等响应缓存 + 发送
        settleStep({
          implement: async (c) => {
            const pricing = requireStepResult<ModelPricing>(c, STEP_KEYS.pricing);
            const mock = getStepResult<MockStepResult>(c, STEP_KEYS.mockResult);

            // ── mock 回退路径（无可用渠道，同样记账扣费）──
            if (mock) {
              const cost = computeCost(c.model, mock.usage.total_tokens, 0, pricing);

              await settleBilling(c, mock.usage.total_tokens, 0, cost, null, {
                streamed: false,
                trustUpstream: false,
                fallback: true,
                preConsume: readPreConsume(c),
              });

              // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
              await cacheIdempotentResponse(c.requestId, {
                streamed: false,
                body: mock.payload,
                summary: buildIdempotencySummary({
                  requestId: c.requestId,
                  model: c.model,
                  inputTokens: mock.usage.total_tokens,
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
            const parsedBody = requireStepResult<Record<string, unknown>>(c, STEP_KEYS.parsedBody);

            // 从 usage 计费：rerank 上游（Cohere/Jina）usage 常见只有 total_tokens，
            // prompt_tokens 缺失时以 total_tokens 视为输入 token（rerank 无输出 token）
            const u = (parsedBody.usage || {}) as Record<string, unknown>;
            const totalTokens = Number(u.total_tokens) || 0;
            const promptTokens = Number(u.prompt_tokens) || 0;
            const hasUsage = totalTokens > 0;
            const billedInputTokens = hasUsage ? (promptTokens > 0 ? promptTokens : totalTokens) : requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);

            // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与旧 computeCost 完全一致（回归安全）。
            // parseAndDiscount 依赖 prompt_tokens，缺失时折后价恒为 0 → 先归一化补全（只用于计费，不改透传响应体）
            // 折扣率 = 模型级 vendor_pricing.cache_discount_rate → 全局 billing.cache_hit_discount → 默认 0.1
            const billingUsage = hasUsage && promptTokens === 0
              ? { ...(parsedBody.usage as Record<string, unknown>), prompt_tokens: totalTokens }
              : parsedBody.usage;
            const discount = hasUsage ? parseAndDiscount(billingUsage, pricing, await resolveCacheDiscountRate(pricing)) : null;
            const cost = discount ? discount.cost : computeCost(c.model, billedInputTokens, 0, pricing);

            await settleBilling(
              c,
              billedInputTokens,
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
                inputTokens: billedInputTokens,
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

  app.post('/v1/rerank', routeOptions, rerankHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/rerank', routeOptions, rerankHandler);
}
