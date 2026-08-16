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
import { selectChannel, type SelectedChannel } from '../services/upstream/routing';
import { streamRelay } from '../services/upstream/proxy';
import { claudeToOpenAI, openAIToClaude, type ClaudeMessage, type ClaudeContentBlock } from '../services/upstream/claude-adapter';
import { countTokens } from '../services/billing/token-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { getBalance, deductBalance } from '../services/billing/balance';
import { recordConsumption } from '../services/billing/consumption-log';
import { generateCommissionForConsumption } from '../services/agent/commission';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import type { PipelineContext } from '../services/pipeline/types';
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
// 计费常量与工具（与 chat.ts 等价实现）
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
 * @param opts - 记账标记：streamed / trustUpstream / fallback / finishReason / errorCode
 */
async function settleBilling(
  ctx: PipelineContext,
  input: number,
  output: number,
  cost: number,
  channel: SelectedChannel | null,
  opts: { streamed: boolean; trustUpstream: boolean; fallback: boolean; finishReason?: string; errorCode?: string },
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
  });

  // 实时佣金结算（异步，不阻塞响应）：消费产生即结算；无代理绑定则内部跳过。
  // 幂等由 agent_commissions.consumption_record_id 唯一索引保证；进程崩溃由回填调度器自愈。
  if (record?.id) {
    void generateCommissionForConsumption({
      userId: ctx.userId,
      consumptionRecordId: record.id,
      cost: cost.toFixed(8),
    }).catch((e) => {
      console.error(`[messages] commission generation failed for consumption ${record.id}:`, e);
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
    preHandler: [apiKeyAuth],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => req.apiKeyContext?.keyHash || req.ip,
      },
    },
  };

  app.post('/v1/messages', routeOptions, async (request: any, reply: FastifyReply) => {
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

      // 5. Select channel（无可用 → mock 回退）
      const channel = await selectChannel(req.model);

      if (!channel) {
        // ── mock 回退路径：返回 Claude 格式占位响应，同样记账扣费 ──
        const mock = buildMockMessage(req.model, req.messages, estimatedInputTokens, pipelineCtx.requestId);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, mock.usage.input_tokens, mock.usage.output_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.input_tokens, mock.usage.output_tokens, cost, null, {
          streamed: isStream,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
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
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, billing.promptTokens, billing.completionTokens, pricing);

        try {
          await settleBilling(
            pipelineCtx,
            billing.promptTokens,
            billing.completionTokens,
            cost,
            channel,
            { streamed: true, trustUpstream: billing.trustUpstream, fallback: billing.fallback, finishReason: state.finishReason ?? undefined },
          );
        } catch (err) {
          // 流式已开始，无法改状态码；记账失败仅记录（余额不足属罕见竞态）
          console.error(`[Messages] stream settle failed for ${pipelineCtx.requestId}:`, err);
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

      const pricing = await getPricingForModel(req.model);
      const cost = hasUsage
        ? computeCost(req.model, promptTokens, completionTokens, pricing)
        : computeCost(req.model, estimatedInputTokens, 0, pricing);

      const choices = (parsedBody.choices as Array<{ finish_reason?: string }> | undefined);
      const finishReason = String(choices?.[0]?.finish_reason ?? 'stop');

      await settleBilling(
        pipelineCtx,
        hasUsage ? promptTokens : estimatedInputTokens,
        hasUsage ? completionTokens : 0,
        cost,
        channel,
        { streamed: false, trustUpstream: hasUsage, fallback: !hasUsage, finishReason },
      );

      await recordChannelResult(cbKey, true);
      reply.header('X-Request-Id', pipelineCtx.requestId);

      // OpenAI 响应 → Claude 格式响应
      const claudeBody = openAIToClaude(parsedBody, req.model, pipelineCtx.requestId);
      return reply.send(claudeBody);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return sendClaudeError(reply, 402, err.message, 'insufficient_balance');
      }
      if (err instanceof AppError) {
        return sendClaudeError(reply, err.statusCode, err.message, err.code.toLowerCase());
      }
      throw err;
    }
  });
}
