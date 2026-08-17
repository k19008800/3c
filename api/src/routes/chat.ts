/**
 * Chat Completions 网关路由 — OpenAI 兼容 /v1/chat/completions
 *
 * 流式处理链路：
 *   API Key Auth → Validate Request → Count Input Tokens → 余额预检
 *   → Select Channel（无可用 → mock 回退）→ proxy upstream
 *   → Settle Billing（deductBalance + recordConsumption）→ Record Consumption
 *
 * 注册两条路径：
 *   /v1/chat/completions               — OpenAI 兼容（外部 SDK / curl）
 *   /api/v1/v1/chat/completions        — web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { selectChannel } from '../services/upstream/routing';
import { streamRelay, type StreamState } from '../services/upstream/proxy';
import { countTokens } from '../services/billing/token-counter';
import { estimateMultimodalContentTokens } from '../services/billing/multimodal-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { parseAndDiscount } from '../services/billing/cache-billing';
import { getBalance } from '../services/billing/balance';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { recordConversationContext, fingerprintKey } from '../services/audit/conversation-context';
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
import type { SelectedChannel } from '../services/upstream/routing';
import { getPricingForModel, computeCost, computeEstimatedCost } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import { preConsume, releasePreConsume, type PreConsumeResult } from '../services/billing/pre-consume';
import crypto from 'crypto';

// ============================================================
// Types
// ============================================================

interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string | unknown[]; name?: string }>;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stop?: string | string[];
  user?: string;
  [key: string]: unknown;
}

/** 对话上下文留痕累加器 — finally 统一落库（成功/失败/402 都记） */
interface ConversationTrace {
  requestId: string;
  userId: number;
  apiKeyId: number | null;
  clientKeyHash: string;
  requestedModel: string;
  routedModel: string | null;
  supplierId: number | null;
  supplierModelId: number | null;
  supplierKeyFp: string | null;
  messages: unknown[];
  responseText: string | null;
  finishReason: string | null;
  status: string;
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: string | null;
  clientIp: string | null;
  userAgent: string | null;
  occurredAt: Date;
  completedAt: Date | null;
}

// ============================================================
// Helpers
// ============================================================

// 计费工具（getPricingForModel / computeCost / computeEstimatedCost / settleBilling）
// 已抽取至共享服务 services/billing/{pricing,settle}.ts（P0-1），本文件直接 import。
// @see docs/iteration-plan-v2.md P0-1 关键约束（8 处重复实现 → 共享服务）

function validateChatRequest(body: unknown): ChatRequest {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body is required', 400, 'INVALID_REQUEST');
  }

  const req = body as Record<string, unknown>;

  if (typeof req.model !== 'string' || !req.model) {
    throw new AppError('"model" is required', 400, 'INVALID_REQUEST');
  }

  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    throw new AppError('"messages" is required and must be a non-empty array', 400, 'INVALID_REQUEST');
  }

  return req as unknown as ChatRequest;
}

/**
 * 估算输入 token 数（含多模态 content 数组的细粒度估算）
 *
 * 纯文本行为与旧实现完全一致（回归安全）：
 * - content 为 string → tiktoken 计数
 * - content 为数组 → estimateMultimodalContentTokens（注入 tiktoken countText）
 *   - 全字符串数组：逐段 tiktoken 计数，与旧实现逐段计数结果一致
 *   - 含 image_url / input_audio / 未知对象：按多模态细粒度规则估算
 * - msg.tool_calls：JSON 序列化后计入（工具调用参数属于输入的一部分，
 *   见 newapi-gap-analysis.md Batch 4 任务 4.3 多模态细粒度计费）
 * - 每条 message 附加 4 token 格式开销
 *
 * @param messages - 消息数组
 * @param model - 模型名称
 * @returns 估算的输入 token 数
 */
export function estimateInputTokens(messages: Array<{ role: string; content: unknown; tool_calls?: unknown }>, model: string): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += countTokens(msg.content, model);
    } else if (Array.isArray(msg.content)) {
      // 多模态 content 数组：文本部分走 tiktoken，图片/音频走多模态估算
      const est = estimateMultimodalContentTokens(msg.content, model, {
        countText: (text) => countTokens(text, model),
      });
      total += est.totalTokens;
    }

    // 工具调用参数：JSON 序列化后计入输入 token（仅含 tool_calls 的消息触发）
    if (msg.tool_calls) {
      total += countTokens(JSON.stringify(msg.tool_calls), model);
    }
  }
  total += messages.length * 4;
  return total;
}

/**
 * Build the upstream request body, remapping to the supplier's platform model name
 */
function buildUpstreamBody(req: ChatRequest, platformModel: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: platformModel,
    messages: req.messages,
    stream: req.stream ?? false,
  };
  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.n !== undefined) body.n = req.n;
  if (req.stop !== undefined) body.stop = req.stop;
  if (req.user !== undefined) body.user = req.user;
  return body;
}

/** mock 回退：无可用供应商时返回占位 completion，同样记账扣费 */
function buildMockCompletion(model: string, messages: ChatRequest['messages'], inputTokens: number) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = typeof lastUser?.content === 'string' ? lastUser.content.slice(0, 120) : '（无用户消息）';
  const content = `[3cloud 模拟响应] 已收到请求（模型 ${model}）。当前环境未配置可用的供应商 Key，返回占位响应以演示完整计费链路。\n> ${prompt}\n\n配置真实供应商后即可返回模型真实输出。`;
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

// ============================================================
// Route
// ============================================================

export async function chatRoutes(app: FastifyInstance) {
  const handler = async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const body = request.body;

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键：consumption_records.request_id 与 Redis
    // 锁/缓存同键，L2 DB 唯一约束兜底才成立；客户端未传头时行为与旧版一致（随机 UUID）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());
    const isStreamRequest = (body as Record<string, unknown>)?.stream === true;

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

    // Build pipeline context
    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: body as Record<string, unknown>,
      stream: false,
      metadata: {},
    };

    // 对话上下文留痕累加器：各分支填充字段，finally 统一落库（旁路，不阻断主链路）
    const bodyAny = body as Record<string, unknown>;
    const trace: ConversationTrace = {
      requestId: pipelineCtx.requestId,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? null,
      clientKeyHash: ctx?.keyHash ?? '',
      requestedModel: typeof bodyAny.model === 'string' ? bodyAny.model : '',
      routedModel: null,
      supplierId: null,
      supplierModelId: null,
      supplierKeyFp: null,
      messages: Array.isArray(bodyAny.messages) ? bodyAny.messages as unknown[] : [],
      responseText: null,
      finishReason: null,
      status: 'succeeded',
      errorCode: null,
      inputTokens: 0,
      outputTokens: 0,
      cost: null,
      clientIp: request.ip ?? null,
      userAgent: (request.headers?.['user-agent'] as string | undefined) ?? null,
      occurredAt: new Date(),
      completedAt: null,
    };

    // P0-1 预扣结果：转发前冻结（mode='frozen'），成功路径结算、失败路径解冻
    let pre: PreConsumeResult | null = null;

    try {
      try {
      // 1. Validate
      const req = validateChatRequest(body);
      const isStream = req.stream === true;
      pipelineCtx.model = req.model;
      pipelineCtx.stream = isStream;
      trace.requestedModel = req.model;
      trace.messages = req.messages as unknown[];

      // 2. Count input tokens
      const estimatedInputTokens = estimateInputTokens(req.messages as any, req.model);

      // 3. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 3.5 P0-1 阈值旁路 + 预扣：余额 > 阈值 → 旁路（零延迟）；否则 Redis Lua 冻结。
      //     预扣失败（余额不足 402 / Redis 异常旁路降级）都不调上游。
      //     定价提前取一次，供预扣预估与各结算分支复用（与原多次查询结果一致）。
      const pricing = await getPricingForModel(req.model);
      const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, req.max_tokens);
      pre = await preConsume(pipelineCtx, estimatedCost, { balance });

      // 4. Select channel（无可用 → mock 回退）
      //    传入 userId：渠道分组供给过滤（supplier.allowed_groups），见 newapi-gap-analysis.md Batch 4 遗留
      const channel = await selectChannel(req.model, ctx?.userId ? { userId: ctx.userId } : undefined);

      if (!channel) {
        // ── mock 回退路径 ──
        const mock = buildMockCompletion(req.model, req.messages, estimatedInputTokens);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, mock.usage.completion_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, mock.usage.completion_tokens, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
          preConsume: pre,
        });

        trace.routedModel = req.model;
        trace.responseText = mock.content;
        trace.finishReason = 'stop';
        trace.inputTokens = mock.usage.prompt_tokens;
        trace.outputTokens = mock.usage.completion_tokens;
        trace.cost = cost.toFixed(8);
        trace.status = 'succeeded';

        const payload = {
          id: `chatcmpl-${pipelineCtx.requestId}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: req.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: mock.content },
              finish_reason: 'stop',
            },
          ],
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
          reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
          reply.raw.write(`data: ${JSON.stringify({ ...payload, choices: [{ index: 0, delta: { content: mock.content }, finish_reason: 'stop' }] })}\n\n`);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
          return;
        }
        return reply.send(payload);
      }

      // 5. 真实上游路径
      trace.routedModel = channel.modelMapping.platformModel;
      trace.supplierId = channel.supplier.id;
      trace.supplierModelId = channel.modelMapping.id;
      trace.supplierKeyFp = fingerprintKey(channel.key.keyValue);

      const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
      const upstreamBody = buildUpstreamBody(req, channel.modelMapping.platformModel);

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
        trace.status = 'failed';
        trace.errorCode = String(upstreamResp.status);
        trace.responseText = errorBody.slice(0, 20000);
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
        const state: StreamState = await streamRelay(pipelineCtx, reply, upstreamResp);
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
          console.error(`[Chat] stream settle failed for ${pipelineCtx.requestId}:`, err);
          // P0-1：流式结算失败 → 解冻预扣（防资金卡死；幂等，已结算则 no-op）
          await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
        }

        trace.responseText = state.generatedText || null;
        trace.inputTokens = billing.promptTokens;
        trace.outputTokens = billing.completionTokens;
        trace.cost = cost.toFixed(8);
        trace.finishReason = state.finishReason ?? null;
        trace.status = 'succeeded';
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

      // 非流式：从响应体提取助手回复原文
      const choiceMsg = (parsedBody.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message;
      const respText = typeof choiceMsg?.content === 'string' ? choiceMsg.content : null;
      trace.responseText = respText;
      trace.inputTokens = hasUsage ? promptTokens : estimatedInputTokens;
      trace.outputTokens = hasUsage ? completionTokens : 0;
      trace.cost = cost.toFixed(8);
      trace.finishReason = finishReason;
      trace.status = 'succeeded';

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
        trace.completedAt = new Date();
        trace.status = 'failed';
        // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
        if (isIdempotencyUniqueViolation(err)) {
          trace.errorCode = 'IDEMPOTENCY_CONFLICT';
          return sendOpenAIError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict', 409);
        }
        // 处理失败释放幂等锁，允许客户端用同一键重试（成功路径不释放，锁保留到 TTL）
        if (lockToken) {
          await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
        }
        // P0-1：异常路径解冻预扣（未结算时；幂等，已结算/已释放则 no-op）
        await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
        if (err instanceof InsufficientBalanceError) {
          trace.errorCode = 'INSUFFICIENT_BALANCE';
          return sendOpenAIError(reply, 402, err.message, 'insufficient_balance', 402);
        }
        if (err instanceof AppError) {
          trace.errorCode = err.code.toLowerCase();
          return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
        }
        throw err;
      }
    } finally {
      trace.completedAt = new Date();
      // 旁路写入：记录失败只打日志，不改变请求结果
      await recordConversationContext(trace).catch(() => { /* 已由服务内部兜底 */ });
    }
  };

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

  // OpenAI 兼容路径
  app.post('/v1/chat/completions', routeOptions, handler);
  // web-console Playground 内部路径（契约对齐）
  app.post('/api/v1/v1/chat/completions', routeOptions, handler);
}
