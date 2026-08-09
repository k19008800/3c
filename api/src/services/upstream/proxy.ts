/**
 * SSE 流式转发代理 + 非流式透传
 *
 * 职责：
 * - streamRelay：逐行读取上游响应 → 解析 SSE → 累积 usage → 转发
 * - relayNonStream：非流式直接读取 body → 透传
 *
 * @see newapi-migration-guide.md §2.1 SSE 流式转发 + §2.2 中断后结算
 * @module services/upstream
 */

import type { FastifyReply } from 'fastify';
import type { PipelineContext } from '../pipeline/types.js';
import { parseSSELines } from './sse-parser.js';

// ============================================================
// Types
// ============================================================

/** OpenAI 兼容的 Token 用量对象 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** SSE 流式转发后返回的状态 */
export interface StreamState {
  /** 最后一个 finish_reason 非空的 chunk 中的 usage（最可靠的用量数据） */
  lastValidUsage: TokenUsage | null;
  /** 累积的生成文本（从 delta.content 拼接） */
  generatedText: string;
  /** 最后一个有效的 finish_reason 值 */
  finishReason: string | null;
  /** 收到的 chunk 总数 */
  totalChunks: number;
}

/** 非流式响应的包装 */
export interface NonStreamResult {
  /** 响应体（已解析为 JSON） */
  body: Record<string, unknown>;
  /** 从响应中提取的 usage 数据 */
  usage: TokenUsage | null;
}

// ============================================================
// SSE 流式转发
// ============================================================

/**
 * SSE 流式转发代理
 *
 * 逐行读取上游响应 → 解析 SSE data: 行 → 累积 usage 和文本 → 转发给客户端
 *
 * 逻辑：
 *   1. 写 SSE 响应头 (Content-Type: text/event-stream)
 *   2. 逐 chunk 读取上游 body
 *   3. 按 \n 分割 → 逐行解析
 *   4. data: {...} → JSON.parse → 提取 usage / delta.content / finish_reason
 *   5. 保存最后有效 chunk（finish_reason 非空）的 usage
 *   6. 原样转发给客户端
 *   7. data: [DONE] → 结束
 *   8. 返回 StreamState（含累积的 usage 和文本）
 *
 * @param ctx - 请求上下文
 * @param reply - Fastify 响应对象
 * @param upstreamResp - 上游 HTTP 响应（ReadableStream body）
 * @returns StreamState 含 lastValidUsage, generatedText, finishReason, totalChunks
 */
export async function streamRelay(
  ctx: PipelineContext,
  reply: FastifyReply,
  upstreamResp: Response,
): Promise<StreamState> {
  const state: StreamState = {
    lastValidUsage: null,
    generatedText: '',
    finishReason: null,
    totalChunks: 0,
  };

  // 写 SSE 响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': ctx.requestId,
  });

  if (!upstreamResp.body) {
    // 上游无 body，直接结束
    reply.raw.end();
    return state;
  }

  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  const bufferRef = { value: '' };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // 使用 SSE 解析器处理跨 buffer 边界
      parseSSELines(bufferRef, chunk, (data, isData) => {
        if (!isData) {
          // 非 data: 行 → 原样转发（如 event: ..., id: ...）
          reply.raw.write(`${data}\n`);
          return;
        }

        // data: [DONE] → 结束信号
        if (data === '[DONE]') {
          reply.raw.write('data: [DONE]\n\n');
          return;
        }

        // 尝试解析 JSON
        try {
          const parsed = JSON.parse(data);
          state.totalChunks++;

          // 提取 choices[0].delta.content → 累积文本
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (typeof deltaContent === 'string') {
            state.generatedText += deltaContent;
          }

          // 提取 finish_reason → 只有非空的 finish_reason 的 chunk 才更新 usage
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason) {
            state.finishReason = finishReason;

            // 有 usage → 保存（这是最终/最可靠的值）
            if (parsed.usage) {
              state.lastValidUsage = {
                prompt_tokens: Number(parsed.usage.prompt_tokens) || 0,
                completion_tokens: Number(parsed.usage.completion_tokens) || 0,
                total_tokens: Number(parsed.usage.total_tokens) || 0,
              };
            }
          }
        } catch {
          // 非 JSON data 行 → 跳过解析
        }

        // 原样转发给客户端
        reply.raw.write(`data: ${data}\n`);
      });
    }
  } catch (err) {
    // 中断时保留 state 中已累积的数据，外层负责计费决策
    throw err;
  } finally {
    // 确保连接关闭
    reply.raw.end();
  }

  return state;
}

// ============================================================
// 非流式透传
// ============================================================

/**
 * 非流式直接透传
 *
 * 读取上游完整 body → 透传给客户端
 *
 * @param ctx - 请求上下文
 * @param reply - Fastify 响应对象
 * @param upstreamResp - 上游 HTTP 响应
 * @returns NonStreamResult 含解析后的 body 和 usage
 */
export async function relayNonStream(
  ctx: PipelineContext,
  reply: FastifyReply,
  upstreamResp: Response,
): Promise<NonStreamResult> {
  const contentType = upstreamResp.headers.get('content-type') || 'application/json';
  const statusCode = upstreamResp.status;

  // 读取上游 body
  const rawBody = await upstreamResp.text();
  let parsedBody: Record<string, unknown> = {};
  let usage: TokenUsage | null = null;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // 非 JSON 响应 → 原样返回
    parsedBody = { raw: rawBody };
  }

  // 提取 usage
  if (parsedBody.usage) {
    const u = parsedBody.usage as Record<string, unknown>;
    usage = {
      prompt_tokens: Number(u.prompt_tokens) || 0,
      completion_tokens: Number(u.completion_tokens) || 0,
      total_tokens: Number(u.total_tokens) || 0,
    };
  }

  // 透传响应
  reply
    .status(statusCode)
    .header('Content-Type', contentType)
    .header('X-Request-Id', ctx.requestId)
    .send(parsedBody);

  return { body: parsedBody, usage };
}
