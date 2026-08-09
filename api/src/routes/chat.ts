/**
 * Chat Completions 网关路由 — OpenAI 兼容 /v1/chat/completions
 *
 * 流式处理链路：
 *   API Key Auth → Validate Request → Count Input Tokens
 *   → Select Channel → proxy upstream → Settle Billing → Record Consumption
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { apiKeyAuth } from '../services/auth/apikey';
import { selectChannel } from '../services/upstream/routing';
import { streamRelay, relayNonStream } from '../services/upstream/proxy';
import { countTokens } from '../services/billing/token-counter';
import { determineStreamBilling } from '../services/billing/settle-stream';
import { recordChannelResult } from '../services/upstream/circuit-breaker';
import { AppError } from '../lib/errors';
import type { PipelineContext } from '../services/pipeline/types';
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

// ============================================================
// Route
// ============================================================

export async function chatRoutes(app: FastifyInstance) {
  app.post('/v1/chat/completions', {
    preHandler: [apiKeyAuth],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (req: any) => req.apiKeyContext?.keyHash || req.ip,
      },
    },
  }, async (request, reply) => {
    const ctx = (request as any).apiKeyContext;
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

      // 3. Select channel
      const channel = await selectChannel(req.model);
      if (!channel) {
        return reply.status(503).send({
          error: {
            message: `No available supplier for model: ${req.model}`,
            type: 'upstream_error',
            code: 503,
          },
        });
      }

      // 4. Build upstream request
      const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
      const upstreamBody = buildUpstreamBody(req, channel.modelMapping.platformModel);

      // 5. Call upstream
      const upstreamResp = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channel.key.keyValue}`,
        },
        body: JSON.stringify(upstreamBody),
      });

      const cbKey = `supplier:${channel.supplier.id}:key:${channel.key.id}`;

      if (isStream && upstreamResp.ok) {
        // SSE Stream mode
        const state = await streamRelay(pipelineCtx, reply, upstreamResp);

        // Settle billing
        const billing = determineStreamBilling(state, false, estimatedInputTokens, req.model);

        await recordChannelResult(cbKey, true);
        // Consumption recording deferred to Phase 4

      } else if (!isStream && upstreamResp.ok) {
        // Non-stream mode
        const result = await relayNonStream(pipelineCtx, reply, upstreamResp);

        await recordChannelResult(cbKey, true);

        reply.header('Content-Type', 'application/json');
        return reply.send(result.body);

      } else {
        // Upstream error
        await recordChannelResult(cbKey, false);

        let errorBody = '';
        try { errorBody = await upstreamResp.text(); } catch { /* ignore */ }

        reply.status(upstreamResp.status || 502);
        reply.header('Content-Type', 'application/json');

        try {
          return reply.send(JSON.parse(errorBody));
        } catch {
          return reply.send({
            error: {
              message: `Upstream error: ${upstreamResp.status}`,
              type: 'upstream_error',
              code: upstreamResp.status || 502,
            },
          });
        }
      }

    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({
          error: { message: err.message, type: err.code.toLowerCase(), code: err.statusCode },
        });
      }
      throw err;
    }
  });

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
