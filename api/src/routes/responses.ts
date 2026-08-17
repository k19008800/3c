/**
 * OpenAI Responses API 兼容网关路由 — POST /v1/responses
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 4，任务 4.4）。
 * 完整转发/计费链路对齐 messages.ts（/v1/messages），P0-4 已改写为 pipeline steps：
 *
 *   auth → idempotency → rate-limit → validate → pre-consume → route → proxy → settle
 *
 * 链路说明（与 chat.ts / messages.ts 一致）：
 *   - auth / rate-limit 由 Fastify preHandler（apiKeyAuth / enforceRateLimitPreHandler）
 *     强制执行，pipeline 中对应 step 为链路声明 + 断言；
 *   - idempotency（P0-3）：获取锁失败（重复）→ 抛 IdempotencyConflictError → 路由回放首次结果；
 *     后续步骤失败 → rollback 释放锁（允许同一键重试）；
 *   - validate：校验 + responsesToChat 转换 + token 计数 + 余额预检(≤0 → 402) +
 *     定价/预估费用写入共享存储；
 *   - pre-consume（P0-1）：余额 > 阈值旁路，否则 Redis Lua 冻结；后续失败 → rollback 解冻；
 *   - route：渠道选择（无可用 → proxy step 走 mock 回退）；
 *   - proxy：本路由使用本地 proxy step（等价共享 proxyStep，唯一差异：流式分支调用
 *     relayResponsesStream 把上游 chat SSE 转换为 Responses 事件序列再写出）；
 *   - settle：记账扣费（settleBilling 共享服务）+ 幂等响应缓存 + 响应转换后发送。
 *
 * 与 messages.ts 的差异：
 * - 请求/响应为 OpenAI Responses 格式，由 responses-adapter.ts 纯函数做格式转换
 * - 流式（stream:true）由 responses-stream.ts 把上游 chat SSE 转换为 Responses 事件序列
 *   （response.created → output_item.added → output_text.delta × N → response.completed），
 *   结算逻辑与 chat.ts 流式路径一致（采信上游 usage，缺失本地 tiktoken 兜底）
 * - 错误响应为 OpenAI error 格式（{ error: { message, type, code } }）
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.4 + 遗留「responses 流式」
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @see coding-standards-control-logic.md（计费/回滚控制逻辑）
 * @see docs/iteration-plan-v2.md P0-4
 * @module routes/responses
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { apiKeyAuth } from '../services/auth/apikey';
import { enforceRateLimitPreHandler } from '../services/rate-limit';
import { responsesToChat, chatToResponses, type ResponsesRequest, type ResponsesInputItem } from '../services/upstream/responses-adapter';
import { relayResponsesStream } from '../services/upstream/responses-stream';
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
  UpstreamPassthroughError,
  settleStep,
  readPreConsume,
  setStepResult,
  requireStepResult,
  getStepResult,
  STEP_KEYS,
  type ProxyStepOptions,
  type MockStepResult,
} from '../services/pipeline';
import type { PipelineContext } from '../services/pipeline';
import type { SelectedChannel } from '../services/upstream/routing';
import { getPricingForModel, computeCost, computeEstimatedCost } from '../services/billing/pricing';
import { settleBilling } from '../services/billing/settle';
import { releasePreConsume } from '../services/billing/pre-consume';
import { preprocessRequestBody } from '../services/upstream/body-preprocessor';
import type { StreamState } from '../services/upstream/proxy';
import crypto from 'crypto';

// ============================================================
// 校验与估算
// ============================================================

// 计费工具（getPricingForModel / computeCost / computeEstimatedCost / settleBilling）
// 已抽取至共享服务 services/billing/{pricing,settle}.ts（P0-1），本文件直接 import。
// @see docs/iteration-plan-v2.md P0-1 关键约束（8 处重复实现 → 共享服务）

/** getPricingForModel 返回的定价结构（validate step 写入共享存储，结算步骤读取） */
type ModelPricing = { input: number; output: number; cacheDiscountRate: number | null };

/** validate step 写回共享存储的请求结果（校验后的请求 + 转换后的上游 OpenAI chat body） */
interface ResponsesValidateResult {
  req: ResponsesRequest;
  openAIBody: Record<string, unknown>;
}

/**
 * 校验 /v1/responses 请求体
 *
 * @param body - 原始请求体
 * @returns 校验通过的请求体
 * @throws {AppError} 缺 model / 缺 input / input 为空 → 400 INVALID_REQUEST
 */
function validateResponsesRequest(body: unknown): ResponsesRequest {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body is required', 400, 'INVALID_REQUEST');
  }

  const req = body as Record<string, unknown>;

  if (typeof req.model !== 'string' || !req.model) {
    throw new AppError('"model" is required', 400, 'INVALID_REQUEST');
  }

  const input = req.input;
  if (typeof input === 'string') {
    if (!input) {
      throw new AppError('"input" must be a non-empty string', 400, 'INVALID_REQUEST');
    }
  } else if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new AppError('"input" must be a non-empty array', 400, 'INVALID_REQUEST');
    }
  } else {
    throw new AppError('"input" is required and must be a string or non-empty array', 400, 'INVALID_REQUEST');
  }

  return req as unknown as ResponsesRequest;
}

/**
 * 估算输入 token 数：对 responsesToChat 转换后的 messages 计数（与 chat.ts 规则一致）
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
// mock 回退与错误响应
// ============================================================

/**
 * 从 Responses input 中提取最后一条用户消息的纯文本（用于 mock 回退的回显 prompt）
 *
 * 字符串直接返回；数组取最后一个 role='user' 的元素，content 为字符串直接返回，
 * 为数组时拼接 text 块；其余返回 null。
 *
 * @param input - Responses 请求的 input 字段
 * @returns 纯文本，无可提取时返回 null
 */
function extractLastUserText(input: string | ResponsesInputItem[]): string | null {
  if (typeof input === 'string') return input || null;
  if (Array.isArray(input)) {
    const lastUser = [...input].reverse().find((it) => it && typeof it === 'object' && it.role === 'user');
    if (!lastUser) return null;
    const content = lastUser.content;
    if (typeof content === 'string') return content || null;
    if (Array.isArray(content)) {
      const texts = content
        .map((part) => (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
          ? (part as Record<string, unknown>).text as string
          : null))
        .filter((t): t is string => t !== null);
      return texts.join(' ') || null;
    }
  }
  return null;
}

/**
 * mock 回退：无可用供应商时返回 Responses 格式占位响应，同样记账扣费
 *
 * 内部构造一个 OpenAI chat 形状的假响应，复用 chatToResponses 做格式转换，
 * 保证与真实路径的响应结构完全一致，再附加 mock 标记。
 *
 * @param model - 用户请求的模型名
 * @param input - 用户请求的 input（用于回显最后一条用户消息）
 * @param inputTokens - 本地估算的输入 token 数（写入 usage）
 * @param requestId - 网关请求 ID（生成 resp_xxx 格式 id）
 * @returns Responses 格式占位响应（含 mock 标记）
 */
function buildMockResponse(model: string, input: string | ResponsesInputItem[], inputTokens: number, requestId: string) {
  const prompt = extractLastUserText(input) ?? '（无用户消息）';
  const content = `[3cloud 模拟响应] 已收到请求（模型 ${model}）。当前环境未配置可用的供应商 Key，返回占位响应以演示完整计费链路。\n> ${prompt.slice(0, 120)}\n\n配置真实供应商后即可返回模型真实输出。`;
  const outputTokens = countTokens(content, model);

  const chatShape = {
    id: `chatcmpl-${requestId}`,
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
  };

  // chatToResponses 返回 Record<string, unknown>，此处收窄出 mock 路径需要的字段类型
  const resp = chatToResponses(chatShape, requestId) as {
    id: string;
    object: string;
    status: string;
    output: Array<Record<string, unknown>>;
    usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  };
  return { ...resp, mock: true };
}

/** 统一 OpenAI 错误响应（{ error: { message, type, code } }） */
function sendOpenAIError(reply: FastifyReply, status: number, message: string, type = 'upstream_error', code?: number) {
  return reply.status(status).send({
    error: { message, type, code: code ?? status },
  });
}

// ============================================================
// 路由本地 proxy step
// ============================================================

/**
 * 路由本地 proxy step — 与共享 proxyStep 等价，唯一差异：
 * 流式分支调用 relayResponsesStream（上游 chat SSE → Responses 事件序列）而非
 * streamRelay（共享 proxyStep 硬编码 streamRelay，其出口是原始 chat SSE）。
 *
 * 说明：/v1/responses 的流式出口必须是 Responses SSE 事件格式（response.created →
 * … → response.completed，responses-stream.ts 实现），属路由专属"响应转换"逻辑
 * （docs/iteration-plan-v2.md P0-4：响应转换放在路由本地步骤/hook），故本路由
 * 不直接复用共享 proxyStep，而是按等价结构实现本地版本。
 *
 * @param opts - 与共享 proxyStep 相同的钩子（buildUpstreamRequest 必填；mockFallback 供 mock 回退）
 * @returns PipelineStep — 上游转发（流式 Responses 事件 relay / 非流式读取）；失败抛 UpstreamPassthroughError
 */
function responsesProxyStep(opts: ProxyStepOptions) {
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
      if (opts.onUpstreamError) {
        await opts.onUpstreamError(ctx, channel, upstreamResp.status);
      } else {
        await recordChannelResult(cbKey, false).catch(() => { /* 熔断记录失败不阻断 */ });
      }
      let errorBody = '';
      try { errorBody = await upstreamResp.text(); } catch { /* ignore */ }
      throw new UpstreamPassthroughError(upstreamResp.status || 502, errorBody);
    }

    setStepResult(ctx, STEP_KEYS.upstreamResp, upstreamResp);

    if (ctx.stream) {
      // ── SSE 流式：上游 chat SSE → Responses 事件转发 + 累积 usage，结束后记熔断成功 ──
      const reply = ctx.reply;
      if (!reply) throw new Error('[Pipeline] stream request requires ctx.reply');
      const state = await relayResponsesStream(ctx, reply, upstreamResp, ctx.model);
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
// Route
// ============================================================

/**
 * 注册 OpenAI Responses 兼容端点：POST /v1/responses
 *
 * preHandler 挂 apiKeyAuth；带与 chat/completions 一致的 rateLimit 配置
 * （按 keyHash 限流 60 次/分钟）。
 *
 * @param app - Fastify 实例
 */
export async function responsesRoutes(app: FastifyInstance) {
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

  const responsesHandler = async (request: any, reply: FastifyReply) => {
    const ctx = (request as any).apiKeyContext as { userId: number; apiKeyId: number; keyHash: string };
    const body = request.body;

    // ── 幂等守卫（P0-3）：键 = Idempotency-Key 头 || 服务端生成 requestId ──
    // pipelineCtx.requestId 统一为幂等键：consumption_records.request_id 与 Redis
    // 锁/缓存同键，L2 DB 唯一约束兜底才成立；客户端未传头时行为与旧版一致（随机 UUID）。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());
    const isStreamRequest = (body as Record<string, unknown>)?.stream === true;

    // Build pipeline context（request/reply 注入供 steps 使用；身份字段由 auth step 同步）
    const pipelineCtx: PipelineContext = {
      requestId: idemKey,
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: body as Record<string, unknown>,
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

        // 2. idempotency — 幂等锁（重复 → 回放；后续失败 → 回滚释放锁）
        idempotencyStep({ key: idemKey, isStream: isStreamRequest }),

        // 3. rate-limit — 四级限流（preHandler 已强制执行；链路声明）
        rateLimitStep(),

        // 4. validate — 校验 + Responses→Chat 转换 + token 计数 + 余额预检 + 定价 + 预估费用
        createStep('validate', async (c) => {
          // 1. Validate
          const req = validateResponsesRequest(c.body);
          c.model = req.model;
          c.stream = req.stream === true;

          // 2. Responses → OpenAI Chat 格式转换（上游统一走 OpenAI 格式）
          const openAIBody = responsesToChat(req);

          // 3. 输入 token 估算（对转换后的 messages）
          const estimatedInputTokens = estimateInputTokens(openAIBody.messages as Array<{ role: string; content: unknown }>, req.model);
          setStepResult(c, STEP_KEYS.request, { req, openAIBody });
          setStepResult(c, STEP_KEYS.estimatedInputTokens, estimatedInputTokens);

          // 4. 余额预检（0 余额直接 402，不浪费上游调用）
          const balance = await getBalance(c.userId);
          if (Number(balance.availableBalance || 0) <= 0) {
            throw new InsufficientBalanceError('0', '0');
          }
          setStepResult(c, STEP_KEYS.balance, balance);

          // 4.5 P0-1 定价 + 预估费用（供 pre-consume step 预扣与各结算分支复用）
          const pricing = await getPricingForModel(req.model);
          const estimatedCost = computeEstimatedCost(req.model, estimatedInputTokens, pricing, Number(req.max_tokens));
          setStepResult(c, STEP_KEYS.pricing, pricing);
          setStepResult(c, STEP_KEYS.estimatedCost, estimatedCost);

          return req;
        }),

        // 5. pre-consume — 阈值旁路 + Redis Lua 冻结（失败 402；后续失败 → 回滚解冻）
        preConsumeStep(),

        // 6. route — 渠道选择（无可用 → proxy step 走 mock 回退）
        routeStep(),

        // 7. proxy — 上游转发（流式 Responses 事件 relay / 非流式读取；上游错误透传）
        responsesProxyStep({
          buildUpstreamRequest: async (c) => {
            const { openAIBody } = requireStepResult<ResponsesValidateResult>(c, STEP_KEYS.request);
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);
            const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
            const upstreamBody: Record<string, unknown> = { ...openAIBody, model: channel.modelMapping.platformModel };
            // 流式请求带上 stream_options.include_usage：多数上游（OpenAI/DeepSeek 等）会在最后帧
            // 返回完整 usage，流式结算可采信，避免本地 tiktoken 兜底
            if (c.stream) upstreamBody.stream_options = { include_usage: true };
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
            const { req } = requireStepResult<ResponsesValidateResult>(c, STEP_KEYS.request);
            const estimatedInputTokens = requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens);
            // mock 为 OpenAI Responses 格式占位响应（保持该路由现有 mock 格式）
            const mock = buildMockResponse(req.model, req.input, estimatedInputTokens, c.requestId);
            const mockOutput = (mock.output as Array<{ content?: Array<{ text?: string }> }>)?.[0];
            const mockText = mockOutput?.content?.[0]?.text ?? '';
            return {
              payload: mock,
              content: mockText,
              usage: {
                prompt_tokens: mock.usage.input_tokens,
                completion_tokens: mock.usage.output_tokens,
                total_tokens: mock.usage.total_tokens,
              },
            };
          },
        }),

        // 8. settle — 记账扣费（mock/流式/非流式三态）+ 幂等响应缓存 + 响应转换后发送
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

              if (c.stream) {
                // 流式 mock：复用 relayResponsesStream，把 mock 内容包装成单个 chat chunk 的 SSE 流，
                // 走与真实路径完全一致的事件序列（response.created → … → response.completed）
                const mockText = mock.content;
                const mockSse = [
                  `data: ${JSON.stringify({
                    id: `chatcmpl-${c.requestId}`,
                    object: 'chat.completion.chunk',
                    choices: [{ index: 0, delta: { content: mockText }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: mock.usage.prompt_tokens, completion_tokens: mock.usage.completion_tokens, total_tokens: mock.usage.total_tokens },
                  })}\n\n`,
                  'data: [DONE]\n\n',
                ].join('');
                const mockResp = new Response(
                  new ReadableStream({
                    start(controller) {
                      controller.enqueue(new TextEncoder().encode(mockSse));
                      controller.close();
                    },
                  }),
                  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
                );
                await relayResponsesStream(c, reply, mockResp, c.model);
                // 幂等：relay 成功后才缓存流式摘要
                await cacheIdempotentResponse(c.requestId, {
                  streamed: true,
                  summary: buildIdempotencySummary({
                    requestId: c.requestId,
                    model: c.model,
                    inputTokens: mock.usage.prompt_tokens,
                    outputTokens: mock.usage.completion_tokens,
                    cost: cost.toFixed(8),
                    finishReason: 'stop',
                    streamed: true,
                  }),
                });
                return;
              }

              // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
              await cacheIdempotentResponse(c.requestId, {
                streamed: false,
                body: mock.payload,
                summary: buildIdempotencySummary({
                  requestId: c.requestId,
                  model: c.model,
                  inputTokens: mock.usage.prompt_tokens,
                  outputTokens: mock.usage.completion_tokens,
                  cost: cost.toFixed(8),
                  finishReason: 'stop',
                  streamed: false,
                }),
              });
              return reply.send(mock.payload);
            }

            // ── 真实上游路径 ──
            const channel = requireStepResult<SelectedChannel>(c, STEP_KEYS.channel);

            // 流式：转发已在 proxy step 完成（relayResponsesStream），此处结算
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
                console.error(`[responses] stream settle failed for ${c.requestId}:`, err);
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

            // 缓存命中打折：上游返回缓存字段时按命中价计费；无缓存字段行为与 computeCost 一致
            // 折扣率 = 模型级 vendor_pricing.cache_discount_rate → 全局 billing.cache_hit_discount → 默认 0.1
            const { cost, discountAmount, cacheHitTokens } = hasUsage
              ? parseAndDiscount(parsedBody.usage, pricing, await resolveCacheDiscountRate(pricing))
              : { cost: computeCost(c.model, requireStepResult<number>(c, STEP_KEYS.estimatedInputTokens), 0, pricing), discountAmount: 0, cacheHitTokens: 0 };

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
                cacheHitTokens,
                cacheDiscount: discountAmount,
                preConsume: readPreConsume(c),
              },
            );

            await recordChannelResult(`supplier:${channel.supplier.id}:key:${channel.key.id}`, true);
            reply.header('X-Request-Id', c.requestId);

            // OpenAI Chat 响应 → Responses 格式响应
            const responsesBody = chatToResponses(parsedBody, c.requestId);

            // 幂等：缓存首次非流式成功响应（命中时直接回放，不重复计费）
            await cacheIdempotentResponse(c.requestId, {
              streamed: false,
              body: responsesBody,
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
            return reply.send(responsesBody);
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

  app.post('/v1/responses', routeOptions, responsesHandler);
  // web-console Playground 内部路径（契约对齐，见 docs/api-contract.md §4）
  app.post('/api/v1/v1/responses', routeOptions, responsesHandler);
}
