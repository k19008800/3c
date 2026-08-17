/**
 * Anthropic Messages API 兼容路由 — /anthropic/v1/messages、/anthropic/v1/models
 *
 * 目标（对齐 DeepSeek 的 Anthropic 兼容能力）：
 *   base_url (OpenAI)     → /v1/chat/completions
 *   base_url (Anthropic)  → /anthropic（SDK 自动拼 /v1/messages）
 *
 * 链路与 chat.ts 完全一致：
 *   API Key Auth（x-api-key 或 Bearer）→ 翻译 Anthropic 请求 → Token 计数
 *   → 余额预检(≤0 → 402) → Select Channel（无可用 → mock 回退）
 *   → 翻译为 OpenAI 请求转发上游 → 翻译回 Anthropic 响应 → Settle Billing → 留痕
 *
 * 与 chat.ts 的差异：
 * - 鉴权兼容 Anthropic SDK 的 x-api-key 头（services/auth/apikey.ts 已扩展）
 * - 请求/响应格式为 Anthropic Messages API（services/anthropic/translate.ts 纯函数翻译）
 * - 流式把上游 OpenAI SSE 翻译为 Anthropic 事件（services/anthropic/stream-relay.ts）
 * - 错误响应为 Anthropic 格式 { type: 'error', error: { type, message } }
 *
 * 说明：与 openai-compat.ts 相同，计费 helper（settleBilling / getPricingForModel 等）
 * 按等价逻辑在本文件实现，不改动 chat.ts 现有行为。
 *
 * @see docs/api-contract.md（Anthropic 兼容入口）
 * @see coding-standards-api-db-test.md
 * @module routes/anthropic
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { countTokens } from '../services/billing/token-counter';
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
import { estimateInputTokens } from './chat';
import { anthropicStreamRelay } from '../services/anthropic/stream-relay';
import { getPricingForModel, computeCost, computeEstimatedCost } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import { preConsume, releasePreConsume, type PreConsumeResult } from '../services/billing/pre-consume';
import {
  translateAnthropicRequest,
  openaiToAnthropicMessage,
  contentToText,
  mapStopReason,
  anthropicMessageStartEvent,
  anthropicContentBlockStart,
  anthropicContentBlockDelta,
  anthropicContentBlockStop,
  anthropicMessageDelta,
  anthropicMessageStop,
  type AnthropicMessageRequest,
  type TranslatedOpenAIRequest,
} from '../services/anthropic/translate';
import crypto from 'crypto';

// ============================================================
// 校验 / mock / 错误响应
// ============================================================

// 计费工具（getPricingForModel / computeCost / computeEstimatedCost / settleBilling）
// 已抽取至共享服务 services/billing/{pricing,settle}.ts（P0-1），本文件直接 import。
// @see docs/iteration-plan-v2.md P0-1 关键约束（8 处重复实现 → 共享服务）

/** 校验并翻译 Anthropic 请求（错误统一转 AppError） */
function validateAnthropicRequest(body: unknown): { req: AnthropicMessageRequest; translated: TranslatedOpenAIRequest } {
  try {
    const req = body as AnthropicMessageRequest;
    const translated = translateAnthropicRequest(body);
    return { req, translated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    throw new AppError(message, 400, 'INVALID_REQUEST');
  }
}

/** 统一 Anthropic 错误响应 */
function sendAnthropicError(reply: FastifyReply, status: number, message: string, type = 'invalid_request_error') {
  return reply.status(status).send({ type: 'error', error: { type, message } });
}

/** 提取用户最后一条文本（mock 回退展示用） */
function lastUserText(req: AnthropicMessageRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]!;
    if (m.role === 'user') {
      return contentToText(m.content).slice(0, 120);
    }
  }
  return '（无用户消息）';
}

/** mock 回退：无可用供应商时返回 Anthropic 格式占位响应，同样记账扣费 */
function buildMockAnthropic(
  req: AnthropicMessageRequest,
  inputTokens: number,
): { content: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } {
  const prompt = lastUserText(req);
  const content = `[3cloud 模拟响应] 已收到请求（模型 ${req.model}）。当前环境未配置可用的供应商 Key，返回占位响应以演示完整计费链路。\n> ${prompt}\n\n配置真实供应商后即可返回模型真实输出。`;
  const outputTokens = countTokens(content, req.model);
  return {
    content,
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
  };
}

// ============================================================
// 对话上下文留痕（旁路，不阻断主链路）
// ============================================================

interface AnthropicTrace {
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
// Routes
// ============================================================

/**
 * 注册 Anthropic 兼容端点：POST /anthropic/v1/messages、GET /anthropic/v1/models
 *
 * @param app - Fastify 实例
 */
export async function anthropicRoutes(app: FastifyInstance) {
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
  // POST /anthropic/v1/messages
  // ============================================================
  app.post('/anthropic/v1/messages', routeOptions, async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const bodyAny = request.body as Record<string, unknown>;

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键（见 chat.ts 同款注释：保证 L2 DB 兜底同键）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());
    const isStreamRequest = bodyAny?.stream === true;

    // L1: Redis SETNX 获取幂等锁；重复 → 回放首次结果（不重复扣费）
    const lock = await acquireIdempotencyLock(idemKey);
    if (lock.status === 'duplicate') {
      const replayed = await replayIdempotentRequest(reply, idemKey, isStreamRequest);
      if (replayed) return reply;
      // 首次请求仍在处理中（无缓存、无消费记录）→ 409 幂等提示，而非 500
      return sendAnthropicError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict');
    }
    // Redis 降级（不可用）时 lockToken 为 null → 失败路径无可释放的锁
    const lockToken = lock.status === 'acquired' ? lock.token : null;

    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: bodyAny,
      stream: false,
      metadata: {},
    };

    const trace: AnthropicTrace = {
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
      // 1. 校验 + 翻译（Anthropic → OpenAI）
      const { req, translated } = validateAnthropicRequest(request.body);
      const isStream = translated.stream === true;
      pipelineCtx.model = req.model;
      pipelineCtx.stream = isStream;
      trace.requestedModel = req.model;
      trace.messages = req.messages as unknown[];

      // 2. 输入 token 估算（OpenAI 格式消息）
      const estimatedInputTokens = estimateInputTokens(translated.messages as any, req.model);

      // 3. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 3.5 P0-1 阈值旁路 + 预扣（预扣失败 402 / Redis 异常旁路降级，都不调上游）
      //     定价提前取一次，供预扣预估与各结算分支复用（与原多次查询结果一致）。
      const pricing = await getPricingForModel(req.model);
      const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, translated.max_tokens);
      pre = await preConsume(pipelineCtx, estimatedCost, { balance });

      // 4. Select channel（无可用 → mock 回退）
      const channel = await selectChannel(req.model, ctx?.userId ? { userId: ctx.userId } : undefined);

      if (!channel) {
        // ── mock 回退路径：Anthropic 格式占位响应，同样记账扣费 ──
        const mock = buildMockAnthropic(req, estimatedInputTokens);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, mock.usage.completion_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, mock.usage.completion_tokens, cost, null, {
          streamed: isStream,
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

        // 幂等：缓存首次成功响应（mock 非流式存完整 body，流式只存摘要）
        const mockPayload = {
          id: `msg_${pipelineCtx.requestId}`,
          type: 'message',
          role: 'assistant',
          model: req.model,
          content: [{ type: 'text', text: mock.content }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: mock.usage.prompt_tokens,
            output_tokens: mock.usage.completion_tokens,
          },
          mock: true,
        };
        await cacheIdempotentResponse(idemKey, {
          streamed: isStream,
          ...(isStream ? {} : { body: mockPayload }),
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
          const msgId = `msg_${pipelineCtx.requestId}`;
          reply.raw.write(`event: message_start\ndata: ${JSON.stringify(anthropicMessageStartEvent(msgId, req.model, mock.usage.prompt_tokens))}\n\n`);
          reply.raw.write(`event: content_block_start\ndata: ${JSON.stringify(anthropicContentBlockStart(0))}\n\n`);
          reply.raw.write(`event: content_block_delta\ndata: ${JSON.stringify(anthropicContentBlockDelta(0, mock.content))}\n\n`);
          reply.raw.write(`event: content_block_stop\ndata: ${JSON.stringify(anthropicContentBlockStop(0))}\n\n`);
          reply.raw.write(`event: message_delta\ndata: ${JSON.stringify(anthropicMessageDelta('end_turn', mock.usage.completion_tokens))}\n\n`);
          reply.raw.write(`event: message_stop\ndata: ${JSON.stringify(anthropicMessageStop())}\n\n`);
          reply.raw.end();
          return;
        }

        return reply.send(mockPayload);
      }

      // 5. 真实上游转发（翻译回 OpenAI 格式）
      trace.routedModel = channel.modelMapping.platformModel;
      trace.supplierId = channel.supplier.id;
      trace.supplierModelId = channel.modelMapping.id;
      trace.supplierKeyFp = fingerprintKey(channel.key.keyValue);

      const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
      const upstreamBody: Record<string, unknown> = {
        model: channel.modelMapping.platformModel,
        messages: translated.messages,
        stream: isStream,
      };
      if (translated.max_tokens !== undefined) upstreamBody.max_tokens = translated.max_tokens;
      if (translated.temperature !== undefined) upstreamBody.temperature = translated.temperature;
      if (translated.top_p !== undefined) upstreamBody.top_p = translated.top_p;
      if (translated.stop !== undefined) upstreamBody.stop = translated.stop;
      if (translated.tools !== undefined) upstreamBody.tools = translated.tools;

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
          return sendAnthropicError(reply, upstreamResp.status || 502, `Upstream error: ${upstreamResp.status}`, 'api_error');
        }
      }

      if (isStream) {
        // ── 流式：OpenAI SSE → Anthropic 事件，转发后结算 ──
        const state = await anthropicStreamRelay(pipelineCtx, reply, upstreamResp, {
          messageId: `msg_${pipelineCtx.requestId}`,
          model: req.model,
          inputTokens: estimatedInputTokens,
        });
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
          // 流式已开始，无法改状态码；记账失败仅记录
          console.error(`[anthropic] stream settle failed for ${pipelineCtx.requestId}:`, err);
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

      // ── 非流式：先读 body → 结算 → 翻译回 Anthropic 再返回 ──
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

      const u = (parsedBody.usage || {}) as Record<string, unknown>;
      const promptTokens = Number(u.prompt_tokens) || 0;
      const completionTokens = Number(u.completion_tokens) || 0;
      const totalTokens = Number(u.total_tokens) || 0;
      const hasUsage = totalTokens > 0;

      // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与 computeCost 一致
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

      // 提取助手文本（留痕用）
      const choiceMsg = (parsedBody.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message;
      const respText = typeof choiceMsg?.content === 'string' ? choiceMsg.content : null;
      trace.responseText = respText;
      trace.inputTokens = hasUsage ? promptTokens : estimatedInputTokens;
      trace.outputTokens = hasUsage ? completionTokens : 0;
      trace.cost = cost.toFixed(8);
      trace.finishReason = finishReason;
      trace.status = 'succeeded';

      // 翻译回 Anthropic Messages 响应
      const anthropicBody = openaiToAnthropicMessage(parsedBody, req.model, pipelineCtx.requestId);

      // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
      await cacheIdempotentResponse(idemKey, {
        streamed: false,
        body: anthropicBody,
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
      return reply.send(anthropicBody);
    } catch (err) {
      trace.completedAt = new Date();
      trace.status = 'failed';
      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        trace.errorCode = 'IDEMPOTENCY_CONFLICT';
        return sendAnthropicError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict');
      }
      // 处理失败释放幂等锁，允许客户端用同一键重试（成功路径不释放，锁保留到 TTL）
      if (lockToken) {
        await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
      }
      // P0-1：异常路径解冻预扣（未结算时；幂等，已结算/已释放则 no-op）
      await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
      if (err instanceof InsufficientBalanceError) {
        trace.errorCode = 'INSUFFICIENT_BALANCE';
        return sendAnthropicError(reply, 402, err.message, 'insufficient_balance');
      }
      if (err instanceof AppError) {
        trace.errorCode = err.code.toLowerCase();
        return sendAnthropicError(reply, err.statusCode, err.message);
      }
      throw err;
    } finally {
      trace.completedAt = new Date();
      // 旁路写入：记录失败只打日志，不改变请求结果
      await recordConversationContext(trace).catch(() => { /* 已由服务内部兜底 */ });
    }
  });

  // ============================================================
  // GET /anthropic/v1/models
  // ============================================================
  app.get('/anthropic/v1/models', { preHandler: [apiKeyAuth] }, async (_request, reply) => {
    try {
      const rows = await db.select({
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

      // 去重：同一 platformModel 多个供应商只保留一个
      const seen = new Set<string>();
      const data: Array<{ type: string; id: string; display_name: string; created_at: string }> = [];
      for (const row of rows) {
        if (seen.has(row.platformModel)) continue;
        seen.add(row.platformModel);
        data.push({
          type: 'model',
          id: row.platformModel,
          display_name: row.platformModel,
          created_at: new Date(0).toISOString(), // Anthropic 格式要求；无创建时间则用 epoch
        });
      }
      return reply.send({ data });
    } catch {
      // 数据库查询失败 → 兜底空数组，不 500
      return reply.send({ data: [] });
    }
  });
}
