/**
 * Rerank 重排序兼容端点路由 — POST /v1/rerank
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 4 任务 4.1"Rerank 先行"）。
 * Cohere 的 /v1/rerank 是 RAG 检索增强的事实标准（Jina AI 亦提供同名端点），
 * 请求体为 Cohere 兼容格式：{ model, query, documents, top_n?, return_documents? }。
 *
 * 完整转发/计费链路对齐 openai-compat.ts（/v1/embeddings 同构，无流式）：
 *
 *   API Key Auth → Validate（model/query/documents 必填 → 400）
 *   → 输入 token 估算（query + documents 文本 countTokens 求和）
 *   → 余额预检(≤0 → 402) → Select Channel（无可用 → mock 回退）
 *   → proxy upstream（上游透传 Cohere 格式 /v1/rerank）
 *   → 非流式：读响应 → 从 usage 计费（无 usage 用本地估算，trustUpstream/fallback 与 chat.ts 一致）
 *   → 透传上游响应体
 *
 * 与 openai-compat.ts 的差异：
 * - 输入为 query + documents（而非 input/prompt），token 估算两者求和
 * - 上游响应 usage 常见只有 total_tokens（Cohere/Jina rerank），prompt_tokens 缺失时
 *   以 total_tokens 视为输入 token 计费（详见计费段注释）
 * - 记账：streamed=false；model 用用户请求模型；透传 cacheHitTokens/cacheDiscount
 *   （parseAndDiscount 处理，接入方式同 messages.ts）
 *
 * 说明：openai-compat.ts 内的私有 helper（settleBilling / getPricingForModel /
 * computeCost / sendOpenAIError 等）在本文件按等价逻辑重新实现，不改动既有文件行为；
 * 后续可提取到共享 service 层统一维护。
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.1
 * @see newapi-migration-guide.md §2.1-2.3（转发/计费对照）
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/rerank
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { countTokens } from '../services/billing/token-counter';
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
 * preHandler 挂 apiKeyAuth；转发类端点带与 chat/completions 一致的 rateLimit 配置
 * （按 keyHash 限流 60 次/分钟）。
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

    // L1: Redis SETNX 获取幂等锁；重复 → 回放首次结果（不重复扣费；rerank 无流式）
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
      const req = validateRerankRequest(request.body);
      pipelineCtx.model = req.model;

      // 2. 输入 token 估算（query + documents）
      const estimatedInputTokens = estimateRerankInputTokens(req.query, req.documents, req.model);

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
        // ── mock 回退路径：返回占位 rerank 结果，同样记账扣费 ──
        const mock = buildMockRerankResults(req, estimatedInputTokens);
        const cost = computeCost(req.model, mock.usage.total_tokens, 0, pricing);

        await settleBilling(pipelineCtx, mock.usage.total_tokens, 0, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          preConsume: pre,
        });

        // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
        const rerankPayload = {
          id: `rerank-${pipelineCtx.requestId}`,
          results: mock.results,
          model: req.model,
          usage: mock.usage,
          mock: true,
        };
        await cacheIdempotentResponse(idemKey, {
          streamed: false,
          body: rerankPayload,
          summary: buildIdempotencySummary({
            requestId: idemKey,
            model: req.model,
            inputTokens: mock.usage.total_tokens,
            outputTokens: 0,
            cost: cost.toFixed(8),
            finishReason: null,
            streamed: false,
          }),
        });
        return reply.send(rerankPayload);
      }

      // 5. 真实上游转发（rerank 无流式）
      const upstreamUrl = `${channel.supplier.baseUrl}/v1/rerank`;
      const upstreamBody = buildUpstreamRerankBody(req, channel.modelMapping.platformModel);

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

      // 从 usage 计费：rerank 上游（Cohere/Jina）usage 常见只有 total_tokens，
      // prompt_tokens 缺失时以 total_tokens 视为输入 token（rerank 无输出 token）
      const u = (parsedBody.usage || {}) as Record<string, unknown>;
      const totalTokens = Number(u.total_tokens) || 0;
      const promptTokens = Number(u.prompt_tokens) || 0;
      const hasUsage = totalTokens > 0;
      const billedInputTokens = hasUsage ? (promptTokens > 0 ? promptTokens : totalTokens) : estimatedInputTokens;

      // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与旧 computeCost 完全一致（回归安全）。
      // parseAndDiscount 依赖 prompt_tokens，缺失时折后价恒为 0 → 先归一化补全（只用于计费，不改透传响应体）
      const billingUsage = hasUsage && promptTokens === 0
        ? { ...(parsedBody.usage as Record<string, unknown>), prompt_tokens: totalTokens }
        : parsedBody.usage;
      const discount = hasUsage ? parseAndDiscount(billingUsage, pricing) : null;
      const cost = discount ? discount.cost : computeCost(req.model, billedInputTokens, 0, pricing);

      await settleBilling(
        pipelineCtx,
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
          inputTokens: billedInputTokens,
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

  app.post('/v1/rerank', routeOptions, rerankHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/rerank', routeOptions, rerankHandler);
}
