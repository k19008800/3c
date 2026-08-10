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
import { eq, sql } from 'drizzle-orm';
import { apiKeyAuth } from '../services/auth/apikey';
import { selectChannel } from '../services/upstream/routing';
import { streamRelay, type StreamState } from '../services/upstream/proxy';
import { countTokens } from '../services/billing/token-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { getBalance, deductBalance } from '../services/billing/balance';
import { recordConsumption } from '../services/billing/consumption-log';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError, InsufficientBalanceError } from '../lib/errors';
import type { PipelineContext } from '../services/pipeline/types';
import type { SelectedChannel } from '../services/upstream/routing';
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

// ============================================================
// 计费常量与工具
// ============================================================

/** 默认单价（¥ / 1K tokens）——取不到 vendor_pricing 时兜底 */
const DEFAULT_INPUT_PRICE = 0.002;
const DEFAULT_OUTPUT_PRICE = 0.008;

/** 查找模型定价（vendor_pricing × supplier_models），无则默认 */
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

function computeCost(model: string, inputTokens: number, outputTokens: number, pricing?: { input: number; output: number }): number {
  const p = pricing ?? { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

// ============================================================
// Helpers
// ============================================================

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

/** 记账 + 扣费 + 更新 key 最后调用时间 */
async function settleBilling(
  ctx: PipelineContext,
  input: number,
  output: number,
  cost: number,
  channel: SelectedChannel | null,
  opts: { streamed: boolean; trustUpstream: boolean; fallback: boolean; finishReason?: string; errorCode?: string },
): Promise<void> {
  await deductBalance(ctx.userId, cost.toFixed(8), 'consumption', ctx.requestId);

  await recordConsumption({
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

  // 更新 key 最后调用时间
  if (ctx.apiKeyId) {
    await db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, ctx.apiKeyId))
      .catch(() => { /* 非致命 */ });
  }
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

    // Build pipeline context
    const pipelineCtx: PipelineContext = {
      requestId: crypto.randomUUID(),
      userId: ctx?.userId ?? 0,
      apiKeyId: ctx?.apiKeyId ?? 0,
      model: '',
      body: body as Record<string, unknown>,
      stream: false,
      metadata: {},
    };

    try {
      // 1. Validate
      const req = validateChatRequest(body);
      const isStream = req.stream === true;
      pipelineCtx.model = req.model;
      pipelineCtx.stream = isStream;

      // 2. Count input tokens
      const estimatedInputTokens = estimateInputTokens(req.messages as any, req.model);

      // 3. 余额预检（0 余额直接 402，不浪费上游调用）
      const balance = await getBalance(pipelineCtx.userId);
      if (Number(balance.availableBalance || 0) <= 0) {
        throw new InsufficientBalanceError('0', '0');
      }

      // 4. Select channel（无可用 → mock 回退）
      const channel = await selectChannel(req.model);

      if (!channel) {
        // ── mock 回退路径 ──
        const mock = buildMockCompletion(req.model, req.messages, estimatedInputTokens);
        const pricing = await getPricingForModel(req.model);
        const cost = computeCost(req.model, mock.usage.prompt_tokens, mock.usage.completion_tokens, pricing);

        await settleBilling(pipelineCtx, mock.usage.prompt_tokens, mock.usage.completion_tokens, cost, null, {
          streamed: false,
          trustUpstream: false,
          fallback: true,
          finishReason: 'stop',
        });

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

      if (isStream) {
        // ── SSE 流式：转发后结算 ──
        const state: StreamState = await streamRelay(pipelineCtx, reply, upstreamResp);
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
          console.error(`[Chat] stream settle failed for ${pipelineCtx.requestId}:`, err);
        }
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

  // OpenAI 兼容路径
  app.post('/v1/chat/completions', routeOptions, handler);
  // web-console Playground 内部路径（契约对齐）
  app.post('/api/v1/v1/chat/completions', routeOptions, handler);

  // /v1/models
  app.get('/v1/models', {
    preHandler: [apiKeyAuth],
  }, async (_request, reply) => {
    return reply.send({
      object: 'list',
      data: [
        { id: 'deepseek-v3', object: 'model', owned_by: '3cloud' },
        { id: 'deepseek-r1', object: 'model', owned_by: '3cloud' },
        { id: 'gpt-4o', object: 'model', owned_by: '3cloud' },
        { id: 'glm-5-pro', object: 'model', owned_by: '3cloud' },
        { id: 'qwen3-max', object: 'model', owned_by: '3cloud' },
      ],
    });
  });
}
