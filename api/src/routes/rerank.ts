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
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { countTokens } from '../services/billing/token-counter';
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
// 计费常量与工具（与 openai-compat.ts 等价实现）
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
// 记账与 mock 回退（与 openai-compat.ts 等价实现）
// ============================================================

/**
 * 记账 + 扣费 + 更新 key 最后调用时间（与 openai-compat.ts 的 settleBilling 等价）
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
      console.error(`[rerank] commission generation failed for consumption ${record.id}:`, e);
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
  // POST /v1/rerank
  // ============================================================
  const rerankHandler = async (request: any, reply: FastifyReply) => {
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
      const req = validateRerankRequest(request.body);
      pipelineCtx.model = req.model;

      // 2. 输入 token 估算（query + documents）
      const estimatedInputTokens = estimateRerankInputTokens(req.query, req.documents, req.model);

      // 3. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 4. Select channel（无可用 → mock 回退）
      //    传入 userId：渠道分组供给过滤（supplier.allowed_groups），见 newapi-gap-analysis.md Batch 4 遗留
      const channel = await selectChannel(req.model, ctx?.userId ? { userId: ctx.userId } : undefined);

      if (!channel) {
        // ── mock 回退路径：返回占位 rerank 结果，同样记账扣费 ──
        const mock = buildMockRerankResults(req, estimatedInputTokens);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, mock.usage.total_tokens, 0, pricing);

        await settleBilling(pipelineCtx, mock.usage.total_tokens, 0, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
        });

        return reply.send({
          id: `rerank-${pipelineCtx.requestId}`,
          results: mock.results,
          model: req.model,
          usage: mock.usage,
          mock: true,
        });
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

      const pricing = await getPricingForModel(req.model);
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
  };

  app.post('/v1/rerank', routeOptions, rerankHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/rerank', routeOptions, rerankHandler);
}
