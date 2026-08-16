/**
 * Anthropic 流式转发 — OpenAI SSE（上游）→ Anthropic SSE 事件（客户端）
 *
 * 与 proxy.ts 的 streamRelay 区别：streamRelay 原样转发 OpenAI chunk；
 * 本模块把上游 OpenAI 兼容流逐 chunk 翻译为 Anthropic Messages 流事件：
 *
 *   message_start → content_block_start → content_block_delta* → content_block_stop
 *   → message_delta（stop_reason + output_tokens）→ message_stop
 *
 * 同时累积 StreamState（generatedText / finishReason / lastValidUsage），
 * 计费决策与 chat.ts 完全一致（determineStreamBilling）。
 *
 * @module services/anthropic/stream-relay
 * @see services/anthropic/translate.ts（事件构建纯函数）
 */
import type { FastifyReply } from 'fastify';
import type { PipelineContext } from '../pipeline/types.js';
import { parseSSELines } from '../upstream/sse-parser.js';
import type { StreamState } from '../upstream/proxy.js';
import {
  anthropicMessageStartEvent,
  anthropicContentBlockStart,
  anthropicContentBlockDelta,
  anthropicContentBlockStop,
  anthropicMessageDelta,
  anthropicMessageStop,
  extractOpenAIChunk,
  mapStopReason,
} from './translate.js';

/** 流式转发选项 */
export interface AnthropicStreamOptions {
  /** 消息 id（msg_<requestId>） */
  messageId: string;
  /** 用户请求的模型名（写入 message_start） */
  model: string;
  /** 预估输入 token 数（message_start usage.input_tokens；最终以 message_delta 修正） */
  inputTokens: number;
}

/** 以 `event: xxx\ndata: {...}\n\n` 写出一个 Anthropic 事件 */
function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 转发上游 OpenAI SSE 流为 Anthropic 流事件
 *
 * @param ctx - 请求上下文
 * @param reply - Fastify 响应对象
 * @param upstreamResp - 上游 HTTP 响应（ReadableStream body）
 * @param opts - 消息骨架信息
 * @returns StreamState（generatedText / finishReason / lastValidUsage / totalChunks）
 */
export async function anthropicStreamRelay(
  ctx: PipelineContext,
  reply: FastifyReply,
  upstreamResp: Response,
  opts: AnthropicStreamOptions,
): Promise<StreamState> {
  const state: StreamState = {
    lastValidUsage: null,
    generatedText: '',
    finishReason: null,
    totalChunks: 0,
  };

  // SSE 响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': ctx.requestId,
  });

  // message_start（预估输入 tokens）
  writeEvent(reply, 'message_start', anthropicMessageStartEvent(opts.messageId, opts.model, opts.inputTokens));

  let contentStarted = false;

  if (upstreamResp.body) {
    const reader = upstreamResp.body.getReader();
    const decoder = new TextDecoder();
    const bufferRef = { value: '' };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        parseSSELines(bufferRef, chunk, (data, isData) => {
          // Anthropic 流只消费 data: 行；event/id/空行原样跳过
          if (!isData) return;
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            state.totalChunks++;
            const { text, finishReason, usage } = extractOpenAIChunk(parsed);

            // 文本增量 → content_block_start + content_block_delta
            if (typeof text === 'string' && text.length > 0) {
              state.generatedText += text;
              if (!contentStarted) {
                writeEvent(reply, 'content_block_start', anthropicContentBlockStart(0));
                contentStarted = true;
              }
              writeEvent(reply, 'content_block_delta', anthropicContentBlockDelta(0, text));
            }

            // 结束 chunk（finish_reason 非空）→ 记录 usage（最终/最可靠值）
            if (finishReason) {
              state.finishReason = finishReason;
              if (usage && usage.total_tokens > 0) {
                state.lastValidUsage = usage;
              }
            }
          } catch {
            /* 非 JSON data 行 → 忽略 */
          }
        });
      }
    } catch (err) {
      // 上游中断：先补发收尾事件（客户端 Anthropic SDK 不悬挂），再向上抛
      // （路由层按 chat.ts 一致语义处理留痕/计费决策）
      closeAnthropicStream(reply, state, contentStarted);
      throw err;
    }
  }

  // 正常结束 → 收尾事件
  closeAnthropicStream(reply, state, contentStarted);

  return state;
}

/** 补发 Anthropic 流收尾事件并关闭连接（正常结束 / 上游中断共用） */
function closeAnthropicStream(
  reply: FastifyReply,
  state: StreamState,
  contentStarted: boolean,
): void {
  if (contentStarted) {
    writeEvent(reply, 'content_block_stop', anthropicContentBlockStop(0));
  }
  writeEvent(
    reply,
    'message_delta',
    anthropicMessageDelta(mapStopReason(state.finishReason), state.lastValidUsage?.completion_tokens ?? 0),
  );
  writeEvent(reply, 'message_stop', anthropicMessageStop());
  reply.raw.end();
}
