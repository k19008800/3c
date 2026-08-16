/**
 * OpenAI Responses API 兼容网关路由 — POST /v1/responses
 *
 * 补齐 New API 兼容端点覆盖（见 newapi-gap-analysis.md Batch 4，任务 4.4）。
 * 完整转发/计费链路对齐 messages.ts（/v1/messages）：
 *
 *   API Key Auth → Validate（model/input 必填 → 400）→ responsesToChat 转换
 *   → Count Input Tokens（对转换后 messages）→ 余额预检(≤0 → 402)
 *   → Select Channel（无可用 → mock 回退）
 *   → proxy upstream（上游统一走 OpenAI 格式 /v1/chat/completions）
 *   → 非流式：读响应 → parseAndDiscount 计费（含缓存打折）→ chatToResponses 转换返回
 *
 * 与 messages.ts 的差异：
 * - 请求/响应为 OpenAI Responses 格式，由 responses-adapter.ts 纯函数做格式转换
 * - 本期仅支持非流式：stream:true 直接 400 明确提示（流式后续 Batch 实现）
 * - 错误响应为 OpenAI error 格式（{ error: { message, type, code } }）
 *
 * 说明：chat.ts / messages.ts 内的私有 helper（settleBilling / getPricingForModel 等）
 * 在本文件按等价逻辑重新实现，不改动既有路由行为；后续可提取到共享 service 层统一维护。
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.4
 * @see coding-standards-api-db-test.md（API/DB/测试规范）
 * @see coding-standards-control-logic.md（计费/回滚控制逻辑）
 * @module routes/responses
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { responsesToChat, chatToResponses, type ResponsesRequest, type ResponsesInputItem } from '../services/upstream/responses-adapter';
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
// 计费常量与工具（与 chat.ts / messages.ts 等价实现）
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
// 记账与 mock 回退（与 chat.ts / messages.ts 等价实现）
// ============================================================

/**
 * 记账 + 扣费 + 更新 key 最后调用时间（与 chat.ts 的 settleBilling 等价）
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
  opts: { streamed: boolean; trustUpstream: boolean; fallback: boolean; finishReason?: string; errorCode?: string; cacheHitTokens?: number; cacheDiscount?: number },
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
      console.error(`[responses] commission generation failed for consumption ${record.id}:`, e);
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
    preHandler: [apiKeyAuth],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => req.apiKeyContext?.keyHash || req.ip,
      },
    },
  };

  app.post('/v1/responses', routeOptions, async (request: any, reply: FastifyReply) => {
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
      const req = validateResponsesRequest(request.body);
      pipelineCtx.model = req.model;

      // 本期仅支持非流式：stream:true 明确 400（流式后续 Batch 实现），
      // 避免静默降级为非流式导致客户端按 SSE 解析 JSON 而报错
      if (req.stream === true) {
        throw new AppError('Streaming is not supported for /v1/responses yet', 400, 'INVALID_REQUEST');
      }

      // 2. Responses → OpenAI Chat 格式转换（上游统一走 OpenAI 格式）
      const openAIBody = responsesToChat(req);

      // 3. 输入 token 估算（对转换后的 messages）
      const estimatedInputTokens = estimateInputTokens(openAIBody.messages as Array<{ role: string; content: unknown }>, req.model);

      // 4. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 5. Select channel（无可用 → mock 回退）
      const channel = await selectChannel(req.model);

      if (!channel) {
        // ── mock 回退路径：返回 Responses 格式占位响应，同样记账扣费 ──
        const mock = buildMockResponse(req.model, req.input, estimatedInputTokens, pipelineCtx.requestId);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, mock.usage.input_tokens, mock.usage.output_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.input_tokens, mock.usage.output_tokens, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
        });

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

      // ── 非流式：先读 body → 结算 → 转换 → 返回（保证扣费失败能返回 402）──
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }

      const u = (parsedBody.usage || {}) as Record<string, unknown>;
      const promptTokens = Number(u.prompt_tokens) || 0;
      const completionTokens = Number(u.completion_tokens) || 0;
      const totalTokens = Number(u.total_tokens) || 0;
      const hasUsage = totalTokens > 0;

      const pricing = await getPricingForModel(req.model);
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
        },
      );

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);

      // OpenAI Chat 响应 → Responses 格式响应
      const responsesBody = chatToResponses(parsedBody, pipelineCtx.requestId);
      return reply.send(responsesBody);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return sendOpenAIError(reply, 402, err.message, 'insufficient_balance', 402);
      }
      if (err instanceof AppError) {
        return sendOpenAIError(reply, err.statusCode, err.message, err.code.toLowerCase(), err.statusCode);
      }
      throw err;
    }
  });
}
