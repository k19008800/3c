/**
 * OpenAI Responses API 流式转发 — 上游 Chat Completions SSE → Responses SSE 事件
 *
 * 背景：/v1/responses 的 stream:true 语义与 /v1/chat/completions 不同——
 * 上游统一走 OpenAI 格式 /v1/chat/completions（SSE chunk），网关在出口把
 * chat chunk 转换为 Responses API 的 SSE 事件序列（response.created →
 * output_item.added → output_text.delta × N → output_text.done → output_item.done
 * → response.completed），客户端（GPT-5 / Codex 等新一代 SDK）无需改动即可消费。
 *
 * 职责：
 * - chatChunkToResponsesEvents：单个 chat chunk → Responses 事件数组（纯函数，可单测）
 * - buildResponsesStreamCompletion：流结束 → 收尾事件（纯函数）
 * - relayResponsesStream：读上游 SSE → 逐 chunk 转换 → 写回客户端（对齐 proxy.ts streamRelay 模式）
 *
 * 设计约束：
 * - 状态累积（generatedText / finishReason / lastValidUsage / totalChunks）与
 *   proxy.ts 的 StreamState 兼容，可直接复用 settle-stream.ts 的 determineStreamBilling
 * - 计费与 chat.ts 流式路径一致：上游最后帧 usage 采信，缺失时本地 tiktoken 兜底
 *
 * @see newapi-gap-analysis.md Batch 4 遗留「responses 流式」
 * @see responses-adapter.ts（非流式转换）
 * @see proxy.ts streamRelay（同构的 chat SSE 转发器）
 * @module services/upstream
 */

import type { FastifyReply } from 'fastify';
import type { PipelineContext } from '../pipeline/types.js';
import { parseSSELines } from './sse-parser.js';
import type { StreamState, TokenUsage } from './proxy.js';
import { mapResponsesStatus } from './responses-adapter.js';

// ============================================================
// 类型定义
// ============================================================

/** Responses 流式转发后的状态（继承 chat 流式状态，可直接喂给 determineStreamBilling） */
export interface ResponsesStreamState extends StreamState {
  /** 是否已发出 output_item.added / content_part.added（首个 delta 前发出一次） */
  started: boolean;
  /** message item id（msg_{requestId}） */
  itemId: string;
  /** SSE 事件序号（sequence_number，单调递增） */
  sequence: number;
}

/** 单个 SSE 事件（event: 名 + data: 负载） */
export interface ResponsesStreamEvent {
  event: string;
  data: Record<string, unknown>;
}

/** 转换上下文（事件构造所需的不变字段） */
export interface ResponsesStreamContext {
  /** 网关请求 ID（resp_{requestId} / msg_{requestId} 前缀） */
  requestId: string;
  /** 用户请求的模型名（写入 response.model） */
  model: string;
}

/** Responses usage 计数（OpenAI Responses 格式） */
export interface ResponsesUsage {
  input_tokens: number;
  input_tokens_details: { cached_tokens: number };
  output_tokens: number;
  output_tokens_details: { reasoning_tokens: number };
  total_tokens: number;
}

// ============================================================
// 事件构造（纯函数）
// ============================================================

/** 从上游 chat usage 提取 Responses 格式 usage（含缓存命中明细，缺失归 0） */
function toResponsesUsage(usage: TokenUsage | null, rawUsage?: Record<string, unknown>): ResponsesUsage {
  const raw = rawUsage ?? {};
  const details = (raw.prompt_tokens_details as Record<string, unknown> | undefined) ?? {};
  const cachedTokens = Number(details.cached_tokens) || Number(raw.prompt_cache_hit_tokens) || 0;
  return {
    input_tokens: usage?.prompt_tokens ?? 0,
    input_tokens_details: { cached_tokens: cachedTokens },
    output_tokens: usage?.completion_tokens ?? 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: usage?.total_tokens ?? 0,
  };
}

/** 构造 response 对象骨架（created / completed 事件共用） */
function buildResponseObject(
  ctx: ResponsesStreamContext,
  opts: {
    status: string;
    output: unknown[];
    usage: ResponsesUsage | null;
    error?: { code: string; message: string } | null;
    incompleteDetails: { reason: string } | null;
    createdAt: number;
  },
): Record<string, unknown> {
  return {
    id: `resp_${ctx.requestId}`,
    object: 'response',
    created_at: opts.createdAt,
    status: opts.status,
    error: opts.error ?? null,
    incomplete_details: opts.incompleteDetails,
    instructions: null,
    max_output_tokens: null,
    model: ctx.model,
    output: opts.output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: true,
    temperature: 1,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: null,
    usage: opts.usage,
  };
}

/**
 * 构造流开始事件：response.created + response.in_progress
 *
 * @param ctx - 转换上下文
 * @param createdAt - 请求创建时间戳（秒）
 * @returns 两个事件
 */
export function buildResponsesStreamStart(ctx: ResponsesStreamContext, createdAt: number): ResponsesStreamEvent[] {
  const resp = buildResponseObject(ctx, {
    status: 'in_progress',
    output: [],
    usage: null,
    incompleteDetails: null,
    createdAt,
  });
  return [
    { event: 'response.created', data: { type: 'response.created', response: resp, sequence_number: 0 } },
    { event: 'response.in_progress', data: { type: 'response.in_progress', response: resp, sequence_number: 1 } },
  ];
}
/**
 * 单个 OpenAI Chat Completions 流式 chunk → Responses 事件数组（纯函数）
 *
 * 转换规则：
 * - 首个含 delta.content 的 chunk：先发 output_item.added + content_part.added，
 *   再发 output_text.delta（state.started 置位后不再重复）
 * - 后续 delta：逐条发 output_text.delta
 * - 含非空 finish_reason 的 chunk：记录 finishReason；若同时带 usage → 采信为 lastValidUsage
 *
 * @param chunk - 已解析的 chat chunk（{ choices: [{ delta, finish_reason }], usage? }）
 * @param state - 流式状态（会被原地修改：totalChunks / generatedText / finishReason / lastValidUsage / started）
 * @param ctx - 转换上下文
 * @returns 待写出的事件数组（可能为空）
 */
export function chatChunkToResponsesEvents(
  chunk: Record<string, unknown>,
  state: ResponsesStreamState,
  ctx: ResponsesStreamContext,
): ResponsesStreamEvent[] {
  const events: ResponsesStreamEvent[] = [];
  state.totalChunks++;

  const choices = (chunk.choices as Array<Record<string, unknown>> | undefined) ?? [];
  const choice = choices[0] ?? {};
  const delta = (choice.delta as Record<string, unknown> | undefined) ?? {};

  // 1. delta.content → 累积文本 + output_text.delta 事件
  const deltaText = typeof delta.content === 'string' ? delta.content : '';
  if (deltaText) {
    if (!state.started) {
      state.started = true;
      events.push(
        {
          event: 'response.output_item.added',
          data: {
            type: 'response.output_item.added',
            output_index: 0,
            item: { id: state.itemId, type: 'message', status: 'in_progress', role: 'assistant', content: [] },
            sequence_number: state.sequence++,
          },
        },
        {
          event: 'response.content_part.added',
          data: {
            type: 'response.content_part.added',
            item_id: state.itemId,
            output_index: 0,
            content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] },
            sequence_number: state.sequence++,
          },
        },
      );
    }
    state.generatedText += deltaText;
    events.push({
      event: 'response.output_text.delta',
      data: {
        type: 'response.output_text.delta',
        item_id: state.itemId,
        output_index: 0,
        content_index: 0,
        delta: deltaText,
        sequence_number: state.sequence++,
      },
    });
  }

  // 2. finish_reason（非空）+ usage → 记录最终状态
  const finishReason = typeof choice.finish_reason === 'string' && choice.finish_reason
    ? choice.finish_reason
    : null;
  if (finishReason) {
    state.finishReason = finishReason;
    if (chunk.usage && typeof chunk.usage === 'object') {
      const u = chunk.usage as Record<string, unknown>;
      state.lastValidUsage = {
        prompt_tokens: Number(u.prompt_tokens) || 0,
        completion_tokens: Number(u.completion_tokens) || 0,
        total_tokens: Number(u.total_tokens) || 0,
      };
    }
  }

  return events;
}

/**
 * 构造流结束事件：output_text.done + content_part.done + output_item.done + response.completed
 *
 * 正常收尾（finishReason 或空流）走 completed/incomplete 状态；
 * 上游中断时传 errorMessage 走 failed 状态（先发 error 事件再发 completed）。
 *
 * @param state - 流式状态（最终 generatedText / finishReason / lastValidUsage）
 * @param ctx - 转换上下文
 * @param createdAt - 请求创建时间戳（秒）
 * @param errorMessage - 上游中断错误信息；无错误时传 undefined
 * @returns 收尾事件数组
 */
export function buildResponsesStreamCompletion(
  state: ResponsesStreamState,
  ctx: ResponsesStreamContext,
  createdAt: number,
  errorMessage?: string,
): ResponsesStreamEvent[] {
  const text = state.generatedText;
  const rawUsage = state.lastValidUsage;
  const usage = toResponsesUsage(rawUsage);

  const { status: finishStatus, incompleteDetails } = mapResponsesStatus(state.finishReason ?? 'stop');
  const failed = errorMessage !== undefined;
  const status = failed ? 'failed' : finishStatus;
  const error = failed ? { code: 'upstream_error', message: errorMessage ?? 'Upstream stream interrupted' } : null;

  const events: ResponsesStreamEvent[] = [];

  if (failed) {
    events.push({
      event: 'error',
      data: { type: 'error', code: error?.code, message: error?.message, param: null },
    });
  } else {
    events.push(
      {
        event: 'response.output_text.done',
        data: {
          type: 'response.output_text.done',
          item_id: state.itemId,
          output_index: 0,
          content_index: 0,
          text,
          annotations: [],
          sequence_number: state.sequence++,
        },
      },
      {
        event: 'response.content_part.done',
        data: {
          type: 'response.content_part.done',
          item_id: state.itemId,
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text, annotations: [] },
          sequence_number: state.sequence++,
        },
      },
      {
        event: 'response.output_item.done',
        data: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            id: state.itemId,
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }],
          },
          sequence_number: state.sequence++,
        },
      },
    );
  }

  const output = failed || text === ''
    ? []
    : [{
        id: state.itemId,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      }];

  const resp = buildResponseObject(ctx, { status, output, usage, error, incompleteDetails, createdAt });
  events.push({
    event: 'response.completed',
    data: { type: 'response.completed', response: resp, sequence_number: state.sequence++ },
  });

  return events;
}

// ============================================================
// SSE 写出
// ============================================================

/** 写单个 Responses SSE 事件（event: 行 + data: 行 + 空行） */
function writeEvent(reply: FastifyReply, event: ResponsesStreamEvent): void {
  reply.raw.write(`event: ${event.event}\n`);
  reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

// ============================================================
// 流式转发
// ============================================================

/**
 * Responses 流式转发代理：上游 Chat SSE → Responses SSE 事件 → 客户端
 *
 * 流程：
 *   1. 写 SSE 响应头
 *   2. 发 response.created + response.in_progress
 *   3. 逐 chunk 读上游 body → parseSSELines → 每个 chat chunk 经
 *      chatChunkToResponsesEvents 转换为 Responses 事件写回
 *   4. data: [DONE] → 结束；循环正常退出 → 发收尾事件（completed）
 *   5. 上游读取异常 → 发 error + completed(failed)，仍返回累积状态供计费
 *   6. 返回 ResponsesStreamState（含 usage / 文本，可直接喂 determineStreamBilling）
 *
 * @param ctx - 流水线上下文（requestId 等）
 * @param reply - Fastify 响应对象
 * @param upstreamResp - 上游 SSE 响应（ReadableStream body）
 * @param model - 用户请求的模型名（写入 response.model）
 * @returns 流式状态（lastValidUsage / generatedText / finishReason / totalChunks）
 */
export async function relayResponsesStream(
  ctx: PipelineContext,
  reply: FastifyReply,
  upstreamResp: Response,
  model: string,
): Promise<ResponsesStreamState> {
  const requestId = ctx.requestId;
  const createdAt = Math.floor(Date.now() / 1000);
  const convCtx: ResponsesStreamContext = { requestId, model };

  const state: ResponsesStreamState = {
    lastValidUsage: null,
    generatedText: '',
    finishReason: null,
    totalChunks: 0,
    started: false,
    itemId: `msg_${requestId}`,
    sequence: 2, // response.created(0) + response.in_progress(1) 已占
  };

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': requestId,
  });

  for (const ev of buildResponsesStreamStart(convCtx, createdAt)) {
    writeEvent(reply, ev);
  }

  if (!upstreamResp.body) {
    for (const ev of buildResponsesStreamCompletion(state, convCtx, createdAt)) {
      writeEvent(reply, ev);
    }
    reply.raw.end();
    return state;
  }

  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  const bufferRef = { value: '' };
  let streamError: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      parseSSELines(bufferRef, chunk, (line, isData) => {
        if (!isData) return; // chat 上游无 event:/id: 行，忽略
        if (line === '[DONE]') return;
        try {
          const parsed = JSON.parse(line);
          for (const ev of chatChunkToResponsesEvents(parsed, state, convCtx)) {
            writeEvent(reply, ev);
          }
        } catch {
          /* 非 JSON data 行 → 跳过（与 proxy.ts streamRelay 一致） */
        }
      });
    }
  } catch (err) {
    // 上游中断：保留已累积状态供计费，客户端收到 failed 收尾
    streamError = err instanceof Error ? err.message : 'Upstream stream interrupted';
  }

  for (const ev of buildResponsesStreamCompletion(state, convCtx, createdAt, streamError)) {
    writeEvent(reply, ev);
  }
  reply.raw.end();

  return state;
}
