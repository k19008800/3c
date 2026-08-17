/**
 * Anthropic Messages API 兼容路由 — /anthropic/v1/messages、/anthropic/v1/models
 *
 * 目标（对齐 DeepSeek 的 Anthropic 兼容能力）：
 *   base_url (OpenAI)     → /v1/chat/completions
 *   base_url (Anthropic)  → /anthropic（SDK 自动拼 /v1/messages）
 *
 * 流式处理链路（P0-4 已改写为 pipeline steps）：
 *   auth → idempotency → rate-limit → validate → pre-consume → route → proxy → settle
 *
 * 说明：
 *   - auth / rate-limit 由 Fastify preHandler（apiKeyAuth / enforceRateLimitPreHandler）
 *     强制执行，pipeline 中对应 step 为链路声明 + 断言；
 *   - idempotency（P0-3）：获取锁失败（重复）→ 抛 IdempotencyConflictError → 路由回放首次结果；
 *     后续步骤失败 → rollback 释放锁（允许同一键重试）；
 *   - pre-consume（P0-1）：余额 > 阈值旁路，否则 Redis Lua 冻结；后续失败 → rollback 解冻；
 *   - proxy：上游转发（流式 anthropicStreamRelay 事件翻译 / 非流式读取），上游错误透传
 *     （UpstreamPassthroughError）。共享 proxyStep 的流式转发为 OpenAI 原样透传（streamRelay），
 *     不满足 Anthropic 事件格式要求，且禁止改动共享步骤 → 本路由用路由本地 proxy step
 *     （anthropicProxyStep）等价实现，仅流式转发换成 anthropicStreamRelay；
 *   - settle：记账扣费（settleBilling 共享服务）+ 幂等响应缓存 + 对话留痕。
 *
 * 与 chat.ts 的差异：
 * - 鉴权兼容 Anthropic SDK 的 x-api-key 头（services/auth/apikey.ts 已扩展）
 * - 请求/响应格式为 Anthropic Messages API（services/anthropic/translate.ts 纯函数翻译）
 * - 流式把上游 OpenAI SSE 翻译为 Anthropic 事件（services/anthropic/stream-relay.ts）
 * - 错误响应为 Anthropic 格式 { type: 'error', error: { type, message } }
 *
 * @see docs/api-contract.md（Anthropic 兼容入口）
 * @see docs/iteration-plan-v2.md P0-4
 * @module routes/anthropic
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
import { recordConversationContext, fingerprintKey } from '../services/audit/conversation-context';
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
  UpstreamPassthroughError,
  settleStep,
  readPreConsume,
  setStepResult,
  requireStepResult,
  getStepResult,
  STEP_KEYS,
  type MockStepResult,
  type UpstreamRequest,
} from '../services/pipeline';
import type { PipelineContext } from '../services/pipeline';
import type { SelectedChannel } from '../services/upstream/routing';
import { estimateInputTokens } from './chat';
import { anthropicStreamRelay } from '../services/anthropic/stream-relay';
import { getPricingForModel, computeCost, computeEstimatedCost } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import { releasePreConsume } from '../services/billing/pre-consume';
import { preprocessRequestBody } from '../services/upstream/body-preprocessor';
import type { StreamState } from '../services/upstream/proxy';
import {
  translateAnthropicRequest,
  openaiToAnthropicMessage,
  contentToText,
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
// 路由本地 proxy step（anthropic 流式事件翻译，见文件头说明）
// ============================================================

/** anthropic 路由本地 proxy step 选项（与共享 proxyStep 对齐） */
interface AnthropicProxyStepOptions {
  /** 构造上游请求（URL / headers / body；可异步，如多模态预处理落盘） */
  buildUpstreamRequest: (ctx: PipelineContext) => UpstreamRequest | Promise<UpstreamRequest>;
  /** mock 回退：无可用渠道时构造占位响应；缺省 → 无渠道时抛 502 */
  mockFallback?: (ctx: PipelineContext) => Promise<MockStepResult | null>;
}

/**
 * 创建 anthropic 路由本地 proxy step
 *
 * 与共享 proxyStep（services/pipeline/steps/proxy.ts）语义完全一致（STEP_KEYS 读写、
 * UpstreamPassthroughError 透传、mock 回退、熔断记录），唯一差异：流式转发用
 * anthropicStreamRelay（OpenAI SSE → Anthropic 事件）而非 streamRelay（原样透传）。
 * 共享步骤禁止改动，故在此等价实现。
 *
 * @param opts - 路由专属钩子
 * @returns PipelineStep — 上游转发（流式 anthropic 事件翻译 / 非流式读取）
 */
function anthropicProxyStep(opts: AnthropicProxyStepOptions) {
  return createStep('proxy', async (ctx) => {
    const channel = requireStepResult<SelectedChannel | null>(ctx, STEP_KEYS.channel);

    // ── 无可用渠道 → mock 回退（占位响应 + 记账，不调上游）──
    if (!channel) {
      if (!opts.mockFallback) {
        throw new AppError('No available channel for model', 502, 'NO_AVAILABLE_CHANNEL');
      }
      const mock = await opts.mockFallback(ctx);
      if (mock) {
        setStepResult(ctx, STEP_KEYS.mockResult, mock);
        return mock;
      }
      throw new AppError('No available channel for model', 502, 'NO_AVAILABLE_CHANNEL');
    }

    const { url, headers, body } = await opts.buildUpstreamRequest(ctx);
    const upstreamResp = await fetch(url, { method: 'POST', headers, body });
    const cbKey = `supplier:${channel.supplier.id}:key:${channel.key.id}`;

    if (!upstreamResp.ok) {
      await recordChannelResult(cbKey, false).catch(() => { /* 熔断记录失败不阻断 */ });
      let errorBody = '';
      try { errorBody = await upstreamResp.text(); } catch { /* ignore */ }
      throw new UpstreamPassthroughError(upstreamResp.status || 502, errorBody);
    }

    setStepResult(ctx, STEP_KEYS.upstreamResp, upstreamResp);

    if (ctx.stream) {
      // ── SSE 流式：OpenAI SSE → Anthropic 事件，转发后结算 ──
      const reply = ctx.reply;
      if (!reply) throw new Error('[Pipeline] stream request requires ctx.reply');
      const state = await anthropicStreamRelay(ctx, reply, upstreamResp, {
        messageId: `msg_${ctx.requestId}`,
        model: ctx.model,
        inputTokens: requireStepResult<number>(ctx, STEP_KEYS.estimatedInputTokens),
      });
      setStepResult(ctx, STEP_KEYS.streamState, state);
      await recordChannelResult(cbKey, true).catch(() => { /* 熔断记录失败不阻断 */ });
      return state;
    }

    // ── 非流式：只读取 + 解析（发送在 settle step，保证结算失败能返回 402）──
    const rawBody = await upstreamResp.text();
    let parsedBody: Record<string, unknown> = {};
    try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }
    setStepResult(ctx, STEP_KEYS.parsedBody, parsedBody);
    return parsedBody;
  });
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

    // 对话上下文留痕累加器：各步骤填充字段，finally 统一落库（旁路，不阻断主链路）
    const trace: AnthropicTrace = {
      requestId: pipelineCtx.requestId,
      userId: apiKeyContext?.userId ?? 0,
      apiKeyId: apiKeyContext?.apiKeyId ?? null,
      clientKeyHash: apiKeyContext?.keyHash ?? '',
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

    try {
      const result = await runPipeline(pipelineCtx, [
        // 1. auth — API Key 认证（preHandler 已执行；此处断言上下文就绪）
        authStep(),

        // 2. idempotency — 幂等锁（重复 → 回放；后续失败 → 回滚释放锁）
        idempotencyStep({ key: idemKey, isStream: isStreamRequest }),

        // 3. rate-limit — 四级限流（preHandler 已强制执行；链路声明）
        rateLimitStep(),

        // 4. validate — 校验 + 翻译 + token 计数 + 余额预检 + 定价 + 预估费用
        createStep('validate', async (c) => {
          // 1. Validate + 翻译（Anthropic → OpenAI）
          // STEP_KEYS.request 存路由自定义结构：原始 Anthropic 请求 + 翻译后的 OpenAI 请求
          //（上游 body 构造用 translated，mock 回退用 req）
          const validated = validateAnthropicRequest(c.body);
          const { req, translated } = validated;
          const isStream = translated.stream === true;
          c.model = req.model;
          c.stream = isStream;
          trace.requestedModel = req.model;
          trace.messages = req.messages as unknown[];

          // 2. 输入 token 估算（OpenAI 格式消息）
          const estimatedInputTokens = estimateInputTokens(translated.messages as any, req.model);
          setStepResult(c, STEP_KEYS.request, validated);
          setStepResult(c, STEP_KEYS.estimatedInputTokens, estimatedInputTokens);

          // 3. 余额预检（0 余额直接 402，不浪费上游调用）
          const balance = await getBalance(c.userId);
          if (Number(balance.availableBalance || 0) <= 0) {
            throw new InsufficientBalanceError('0', '0');
          }
          setStepResult(c, STEP_KEYS.balance, balance);

          // 3.5 P0-1 定价 + 预估费用（供 pre-consume step 预扣与各结算分支复用）
          const pricing = await getPricingForModel(req.model);
          const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, translated.max_tokens);
          setStepResult(c, STEP_KEYS.pricing, pricing);
          setStepResult(c, STEP_KEYS.estimatedCost, estimatedCost);

          return req;
        }),

        // 5. pre-consume — 阈值旁路 + Redis Lua 冻结（失败 402；后续失败 → 回滚解冻）
        preConsumeStep(),

        // 6. route — 渠道选择（无可用 → proxy step 走 mock 回退）
        routeStep(),

        // 7. proxy — 上游转发（流式 anthropic 事件翻译 / 非流式读取；上游错误透传）
        anthropicProxyStep({
          buildUpstreamRequest: async (c) => {
            const { translated } = requireStepResult<{ req: AnthropicMessageRequest; translated: TranslatedOpenAIRequest }>(c, STEP_KEYS.request);
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
            const upstreamBody: Record<string, unknown> = {
              model: channel.modelMapping.platformModel,
              messages: translated.messages,
              stream: c.stream,
            };
            if (translated.max_tokens !== undefined) upstreamBody.max_tokens = translated.max_tokens;
            if (translated.temperature !== undefined) upstreamBody.temperature = translated.temperature;
            if (translated.top_p !== undefined) upstreamBody.top_p = translated.top_p;
            if (translated.stop !== undefined) upstreamBody.stop = translated.stop;
            if (translated.tools !== undefined) upstreamBody.tools = translated.tools;
            // P0-4 多模态预处理：大 base64（>10MB）→ 临时文件 + 内网 URL；小 base64 原样转发
            const processed = await preprocessRequestBody(upstreamBody);
            return {
              url: upstreamUrl,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channel.key.keyValue}`,
              },
              body: JSON.stringify(processed),
            };
          },
          mockFallback: async (c) => {
            const { req } = requireStepResult<{ req: AnthropicMessageRequest; translated: TranslatedOpenAIRequest }>(c, STEP_KEYS.request);
            const estimatedInputTokens = requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);
            const mock = buildMockAnthropic(req, estimatedInputTokens);
            return {
              payload: {
                id: `msg_${c.requestId}`,
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
              },
              content: mock.content,
              usage: mock.usage,
            };
          },
        }),

        // 8. settle — 记账扣费（mock/流式/非流式三态）+ 幂等响应缓存 + 留痕
        settleStep({
          implement: async (c) => {
            const pricing = requireStepResult<{ input: number; output: number; cacheDiscountRate: number | null }>(c, STEP_KEYS.pricing);
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

              trace.routedModel = c.model;
              trace.responseText = mock.content;
              trace.finishReason = 'stop';
              trace.inputTokens = mock.usage.prompt_tokens;
              trace.outputTokens = mock.usage.completion_tokens;
              trace.cost = cost.toFixed(8);
              trace.status = 'succeeded';

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
                reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
                const msgId = `msg_${c.requestId}`;
                reply.raw.write(`event: message_start\ndata: ${JSON.stringify(anthropicMessageStartEvent(msgId, c.model, mock.usage.prompt_tokens))}\n\n`);
                reply.raw.write(`event: content_block_start\ndata: ${JSON.stringify(anthropicContentBlockStart(0))}\n\n`);
                reply.raw.write(`event: content_block_delta\ndata: ${JSON.stringify(anthropicContentBlockDelta(0, mock.content))}\n\n`);
                reply.raw.write(`event: content_block_stop\ndata: ${JSON.stringify(anthropicContentBlockStop(0))}\n\n`);
                reply.raw.write(`event: message_delta\ndata: ${JSON.stringify(anthropicMessageDelta('end_turn', mock.usage.completion_tokens))}\n\n`);
                reply.raw.write(`event: message_stop\ndata: ${JSON.stringify(anthropicMessageStop())}\n\n`);
                reply.raw.end();
                return;
              }

              return reply.send(mock.payload);
            }

            // ── 真实上游路径 ──
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            trace.routedModel = channel.modelMapping.platformModel;
            trace.supplierId = channel.supplier.id;
            trace.supplierModelId = channel.modelMapping.id;
            trace.supplierKeyFp = fingerprintKey(channel.key.keyValue);

            // 流式：转发已在 proxy step 完成（anthropicStreamRelay），此处结算
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
                console.error(`[anthropic] stream settle failed for ${c.requestId}:`, err);
                await releasePreConsume(c, readPreConsume(c)).catch(() => { /* 解冻失败有 TTL 兜底 */ });
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
            const parsedBody = requireStepResult<Record<string, unknown>>(c, STEP_KEYS.parsedBody);
            const u = (parsedBody.usage || {}) as Record<string, unknown>;
            const promptTokens = Number(u.prompt_tokens) || 0;
            const completionTokens = Number(u.completion_tokens) || 0;
            const totalTokens = Number(u.total_tokens) || 0;
            const hasUsage = totalTokens > 0;

            // 缓存命中打折：usage 存在时按缓存字段打折计费；无缓存字段时与 computeCost 一致
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

            // 提取助手文本（留痕用）
            const choiceMsg = (parsedBody.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message;
            const respText = typeof choiceMsg?.content === 'string' ? choiceMsg.content : null;
            trace.responseText = respText;
            trace.inputTokens = hasUsage ? promptTokens : requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);
            trace.outputTokens = hasUsage ? completionTokens : 0;
            trace.cost = cost.toFixed(8);
            trace.finishReason = finishReason;
            trace.status = 'succeeded';

            // 翻译回 Anthropic Messages 响应
            const anthropicBody = openaiToAnthropicMessage(parsedBody, c.model, c.requestId);

            // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
            await cacheIdempotentResponse(c.requestId, {
              streamed: false,
              body: anthropicBody,
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
            return reply.send(anthropicBody);
          },
        }),
      ]);

      if (!result.success) throw result.error;
    } catch (err) {
      trace.completedAt = new Date();
      trace.status = 'failed';

      // 幂等锁重复（L1 命中）：回放首次结果，不重复扣费
      if (err instanceof IdempotencyConflictError) {
        const replayed = await replayIdempotentRequest(reply, err.key, err.isStream);
        if (replayed) return reply;
        // 首次请求仍在处理中（无缓存、无消费记录）→ 409 幂等提示，而非 500
        return sendAnthropicError(reply, 409, 'Duplicate request is still being processed', 'idempotency_conflict');
      }

      // 幂等 DB 兜底命中：Redis 首层失效时重复 insert → 409 幂等提示，而非 500
      if (isIdempotencyUniqueViolation(err)) {
        trace.errorCode = 'IDEMPOTENCY_CONFLICT';
        return sendAnthropicError(reply, 409, 'Duplicate request with the same idempotency key', 'idempotency_conflict');
      }

      // 上游 4xx/5xx：透传上游状态码 + 错误体（rollback 已自动解冻预扣 + 释放幂等锁）
      if (err instanceof UpstreamPassthroughError) {
        trace.errorCode = String(err.statusCode);
        trace.responseText = err.upstreamBody.slice(0, 20000);
        reply.status(err.statusCode || 502);
        reply.header('Content-Type', 'application/json');
        try {
          return reply.send(JSON.parse(err.upstreamBody));
        } catch {
          return sendAnthropicError(reply, err.statusCode || 502, `Upstream error: ${err.statusCode}`, 'api_error');
        }
      }

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
