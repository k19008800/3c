/**
 * Anthropic Messages API 兼容网关路由 — POST /v1/messages
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 3，Gate 3.1）。
 * 完整转发/计费链路对齐 chat.ts（/v1/chat/completions）：
 *
 *   API Key Auth → Validate → claudeToOpenAI 转换 → Count Input Tokens（对转换后 messages）
 *   → 余额预检(≤0 → 402) → Select Channel（无可用 → mock 回退）
 *   → proxy upstream（上游统一走 OpenAI 格式 /v1/chat/completions）
 *   → 非流式：openAIToClaude 转换后返回 Claude 格式
 *   → 流式：streamRelay 转发 OpenAI SSE（不做事件格式转换，与 chat.ts 行为一致）
 *   → Settle Billing（deductBalance + recordConsumption）
 *
 * 与 chat.ts 的差异：
 * - 请求/响应为 Anthropic 格式，由 claude-adapter.ts 纯函数做格式转换
 * - 记账 model 用用户请求的模型名；streamed 按实际请求是否流式
 * - 错误响应为 Anthropic error 格式（{ type: 'error', error: {...} }）
 *
 * 说明：chat.ts 内的私有 helper（settleBilling / getPricingForModel 等）
 * 在本文件按等价逻辑重新实现，不改动 chat.ts 现有行为；后续可提取到共享 service 层统一维护。
 *
 * @see newapi-gap-analysis.md Batch 3 任务 3.1
 * @see newapi-migration-guide.md §2.1-2.3（转发/计费对照）
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @module routes/messages
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { streamRelay } from '../services/upstream/proxy';
import { claudeToOpenAI, openAIToClaude, type ClaudeMessage, type ClaudeContentBlock } from '../services/upstream/claude-adapter';
import { countTokens } from '../services/billing/token-counter';
import { parseAndDiscount } from '../services/billing/cache-billing';
import { determineStreamBilling } from '../services/billing/settle-stream';
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
// 类型定义
// ============================================================

/** POST /v1/messages 请求体（Anthropic Messages API 兼容） */
interface MessagesRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  system?: string | ClaudeContentBlock[];
  temperature?: number;
  stream?: boolean;
  [key: string]: unknown;
}

// ============================================================
// 校验与估算
// ============================================================

// 计费工具（getPricingForModel / computeCost / computeEstimatedCost / settleBilling）
// 已抽取至共享服务 services/billing/{pricing,settle}.ts（P0-1），本文件直接 import。
// @see docs/iteration-plan-v2.md P0-1 关键约束（8 处重复实现 → 共享服务）

/**
 * 校验 /v1/messages 请求体
 *
 * @param body - 原始请求体
 * @returns 校验通过的请求体
 * @throws {AppError} 缺 model / 缺 messages / messages 为空 → 400 INVALID_REQUEST
 */
function validateMessagesRequest(body: unknown): MessagesRequest {
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

  return req as unknown as MessagesRequest;
}

/**
 * 估算输入 token 数：对 claudeToOpenAI 转换后的 messages 计数（与 chat.ts 规则一致）
 *
 * 字符串 content 直接计数；数组 content 逐项计数（对象 JSON 序列化后估算）；
 * 每条消息附加 ~4 token 格式开销。
 *
 * @param messages - 转换后的 OpenAI messages
 * @param model - 模型名（用于 tiktoken encoding 选择）
 * @returns token 数
 */
function estimateInputTokens(messages: Array<{ role: string; content: unknown }>, model: string): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += countTokens(msg.content, model);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') {
          total += countTokens(part, model);
        } else if (part && typeof part === 'object') {
          total += countTokens(JSON.stringify(part), model);
        }
      }
    }
    total += 4;
  }
  return total;
}

// ============================================================
// 记账与 mock 回退（与 chat.ts 等价实现）
// ============================================================

/**
 * 从 Claude 消息 content 中提取纯文本（用于 mock 回退的回显 prompt）
 *
 * 字符串直接返回；blocks 数组拼接 text block；其余返回 null。
 *
 * @param content - Claude 消息 content
 * @returns 纯文本，无可提取时返回 null
 */
function extractText(content: ClaudeMessage['content'] | undefined): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string);
    return texts.join(' ') || null;
  }
  return null;
}

/**
 * mock 回退：无可用供应商时返回 Claude 格式占位 message，同样记账扣费
 *
 * @param model - 用户请求的模型名
 * @param messages - 用户请求的 Claude messages（用于回显最后一条用户消息）
 * @param inputTokens - 本地估算的输入 token 数（写入 usage）
 * @param requestId - 网关请求 ID（生成 msg_xxx 格式 id）
 * @returns Claude Messages 格式占位响应（含 mock 标记）
 */
function buildMockMessage(model: string, messages: ClaudeMessage[], inputTokens: number, requestId: string) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = extractText(lastUser?.content) ?? '（无用户消息）';
  const content = `[3cloud 模拟响应] 已收到请求（模型 ${model}）。当前环境未配置可用的供应商 Key，返回占位响应以演示完整计费链路。\n> ${prompt.slice(0, 120)}\n\n配置真实供应商后即可返回模型真实输出。`;
  const outputTokens = countTokens(content, model);

  return {
    id: `msg_${requestId}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: content }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    mock: true,
  };
}

/** 统一 Anthropic 错误响应（{ type: 'error', error: {...} }） */
function sendClaudeError(reply: FastifyReply, status: number, message: string, type = 'api_error') {
  return reply.status(status).send({
    type: 'error',
    error: { type, message },
  });
}

// ============================================================
// Route
// ============================================================

/**
 * 注册 Anthropic 兼容端点：POST /v1/messages
 *
 * preHandler 挂 apiKeyAuth；带与 chat/completions 一致的 rateLimit 配置
 * （按 keyHash 限流 60 次/分钟）。
 *
 * @param app - Fastify 实例
 */
export async function messagesRoutes(app: FastifyInstance) {
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

  const messagesHandler = async (request: any, reply: FastifyReply) => {
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
      return sendClaudeError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict');
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
      const req = validateMessagesRequest(request.body);
      const isStream = req.stream === true;
      pipelineCtx.model = req.model;
      pipelineCtx.stream = isStream;

      // 2. Claude → OpenAI 格式转换（上游统一走 OpenAI 格式）
      const openAIBody = claudeToOpenAI(req);

      // 3. 输入 token 估算（对转换后的 messages）
      const estimatedInputTokens = estimateInputTokens(openAIBody.messages as Array<{ role: string; content: unknown }>, req.model);

      // 4. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 4.5 P0-1 阈值旁路 + 预扣（预扣失败 402 / Redis 异常旁路降级，都不调上游）
      //     定价提前取一次，供预扣预估与各结算分支复用（与原多次查询结果一致）。
      const pricing = await getPricingForModel(req.model);
      const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, req.max_tokens);
      pre = await preConsume(pipelineCtx, estimatedCost, { balance });

      // 5. Select channel（无可用 → mock 回退）
      //    传入 userId：渠道分组供给过滤（supplier.allowed_groups），见 newapi-gap-analysis.md Batch 4 遗留
      const channel = await selectChannel(req.model, ctx?.userId ? { userId: ctx.userId } : undefined);

      if (!channel) {
        // ── mock 回退路径：返回 Claude 格式占位响应，同样记账扣费 ──
        const mock = buildMockMessage(req.model, req.messages, estimatedInputTokens, pipelineCtx.requestId);
        const cost = computeCost(req.model, mock.usage.input_tokens, mock.usage.output_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.input_tokens, mock.usage.output_tokens, cost, null, {
          streamed: isStream,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
          preConsume: pre,
        });

        // 幂等：缓存首次成功响应（mock 非流式存完整 body，流式只存摘要）
        await cacheIdempotentResponse(idemKey, {
          streamed: isStream,
          ...(isStream ? {} : { body: mock }),
          summary: buildIdempotencySummary({
            requestId: idemKey,
            model: req.model,
            inputTokens: mock.usage.input_tokens,
            outputTokens: mock.usage.output_tokens,
            cost: cost.toFixed(8),
            finishReason: 'stop',
            streamed: isStream,
          }),
        });

        if (isStream) {
          // 流式 mock：与 chat.ts 行为一致，发 OpenAI SSE 帧 + [DONE]
          reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
          reply.raw.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: mock.content[0]?.text ?? '' }, finish_reason: 'stop' }] })}\n\n`);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
          return;
        }
        return reply.send(mock);
      }

      // 6. 真实上游路径（OpenAI 格式，model 映射为供应商平台模型名）
      const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
      const upstreamBody = { ...openAIBody, model: channel.modelMapping.platformModel };

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
          return sendClaudeError(reply, upstreamResp.status || 502, `Upstream error: ${upstreamResp.status}`);
        }
      }

      if (isStream) {
        // ── SSE 流式：转发 OpenAI SSE（不做事件格式转换，与 chat.ts 行为一致）→ 结算 ──
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
          console.error(`[Messages] stream settle failed for ${pipelineCtx.requestId}:`, err);
          // P0-1：流式结算失败 → 解冻预扣（防资金卡死；幂等，已结算则 no-op）
          await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
        }
        return;
      }

      // ── 非流式：先读 body → 结算 → 转换 → 返回（保证扣费失败能返回 402）──
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

      const u = (parsedBody.usage || {}) as Record<string, unknown>;
      const promptTokens = Number(u.prompt_tokens) || 0;
      const completionTokens = Number(u.completion_tokens) || 0;
      const totalTokens = Number(u.total_tokens) || 0;
      const hasUsage = totalTokens > 0;

      // 缓存命中打折：上游返回缓存字段时按 10% 命中价计费；无缓存字段行为与 computeCost 一致
      const { cost, discountAmount, cacheHitTokens } = hasUsage
        ? parseAndDiscount(parsedBody.usage, pricing)
        : { cost: computeCost(req.model, estimatedInputTokens, 0, pricing), discountAmount: 0, cacheHitTokens: 0 };

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
          cacheHitTokens,
          cacheDiscount: discountAmount,
          preConsume: pre,
        },
      );

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);

      // OpenAI 响应 → Claude 格式响应
      const claudeBody = openAIToClaude(parsedBody, req.model, pipelineCtx.requestId);

      // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
      await cacheIdempotentResponse(idemKey, {
        streamed: false,
        body: claudeBody,
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
      return reply.send(claudeBody);
    } catch (err) {
      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        return sendClaudeError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict');
      }
      // 处理失败释放幂等锁，允许客户端用同一键重试（成功路径不释放，锁保留到 TTL）
      if (lockToken) {
        await releaseIdempotencyLock(idemKey, lockToken).catch(() => { /* 释放失败不阻断 */ });
      }
      // P0-1：异常路径解冻预扣（未结算时；幂等，已结算/已释放则 no-op）
      await releasePreConsume(pipelineCtx, pre).catch(() => { /* 解冻失败有 TTL 兜底 */ });
      if (err instanceof InsufficientBalanceError) {
        return sendClaudeError(reply, 402, err.message, 'insufficient_balance');
      }
      if (err instanceof AppError) {
        return sendClaudeError(reply, err.statusCode, err.message, err.code.toLowerCase());
      }
      throw err;
    }
  };

  app.post('/v1/messages', routeOptions, messagesHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/messages', routeOptions, messagesHandler);
}
