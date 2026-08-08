/**
 * 上游请求代理 — SSE 流式转发 + 非流式 passthrough
 *
 * 职责：
 * - streamRelay(): 逐 chunk 读取上游流式响应 → 解析 SSE → 累积 usage → 转发给客户端
 * - relayNonStream(): 直接 fetch + passthrough 完整 JSON 响应
 *
 * 累积 usage 规则：
 *   取最后一个 finish_reason 非空的 chunk 中的 usage（对齐 New API 逻辑）
 *
 * @see newapi-migration-guide.md §2.1 SSE 流式转发完整方案
 * @see relay/common_handler/ (New API Go 源码参照)
 * @module services/upstream
 */

import { SseLineBuffer, parseSseLine } from "./sse-parser";
import type { ParsedSseLine } from "./sse-parser";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * SSE 流式转发累积的状态
 *
 * 异常中断时此状态被保留，外层可根据 lastValidUsage 决定计费策略：
 * - lastValidUsage 非 null → 采信上游
 * - lastValidUsage 为 null → 本地 tiktoken fallback
 */
export interface StreamState {
  /** 最后一个 finish_reason 非空帧中的 usage（最可信的 token 统计） */
  lastValidUsage: TokenUsage | null;
  /** 已接收的 chunk 总数 */
  totalChunks: number;
  /** 最后一个非空的 finish_reason */
  finishReason: string | null;
}

/** OpenAI 协议 token 用量 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** 上游代理错误 */
export class UpstreamError extends Error {
  /** HTTP 状态码 */
  readonly statusCode: number;
  /** 上游返回的错误体（JSON 解析结果，可能为 undefined） */
  readonly upstreamBody?: Record<string, unknown>;

  constructor(statusCode: number, message: string, upstreamBody?: Record<string, unknown>) {
    super(message);
    this.name = "UpstreamError";
    this.statusCode = statusCode;
    this.upstreamBody = upstreamBody;
  }
}

// ---------------------------------------------------------------------------
// streamRelay — SSE 流式转发
// ---------------------------------------------------------------------------

/**
 * 执行 SSE 流式转发：逐 chunk 读取上游流，解析 SSE 行，累积 usage，转发给客户端。
 *
 * 算法流程：
 *   1. 从 Upstream ReadableStream 逐 chunk 读取
 *   2. TextDecoder 解码 → SseLineBuffer 按行分割
 *   3. 对每个 data: 行 → parseSseLine 解析 JSON
 *   4. 提取 usage / finish_reason → 更新 StreamState
 *   5. 调用 onData(rawLine) 转发给客户端
 *   6. 遇到 [DONE] → 正常结束
 *   7. 异常中断 → 抛出原始错误（StreamState 保留在调用方通过 try/catch 获取）
 *
 * @param upstreamStream - 上游 fetch 响应的 body（ReadableStream<Uint8Array>）
 * @param onData - 每收到一条完整的 SSE 行时调用（用于转发给客户端），接收包含"data: "前缀的原始行
 * @returns 累积的 StreamState（含 lastValidUsage）
 * @throws 上游流读取错误（中断时 state 保留在调用方的 catch 块中处理）
 *
 * @example
 * ```ts
 * const state: StreamState = { lastValidUsage: null, totalChunks: 0, finishReason: null };
 * try {
 *   await streamRelay(upstreamResp.body!, (line) => reply.raw.write(line + '\n'), state);
 * } catch (err) {
 *   // state.lastValidUsage 保留中断前已累积的数据
 * }
 * ```
 */
export async function streamRelay(
  upstreamStream: ReadableStream<Uint8Array>,
  onData: (line: string) => void,
  state?: StreamState,
): Promise<StreamState> {
  const streamState: StreamState = state ?? {
    lastValidUsage: null,
    totalChunks: 0,
    finishReason: null,
  };

  const reader = upstreamStream.getReader();
  const decoder = new TextDecoder();
  const buffer = new SseLineBuffer();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // 流结束 → flush 剩余行
        const remaining = buffer.flush();
        processLines(remaining, onData, streamState);
        break;
      }

      // 解码本次 chunk，喂入行缓冲
      const text = decoder.decode(value, { stream: true });
      const lines = buffer.feed(text);

      // 处理所有完整行
      processLines(lines, onData, streamState);
    }
  } finally {
    // 确保 reader 被释放
    try {
      reader.releaseLock();
    } catch {
      // reader 可能已被释放
    }
  }

  return streamState;
}

/**
 * 处理一批 SSE 行：解析、累积状态、转发
 */
function processLines(
  lines: string[],
  onData: (line: string) => void,
  state: StreamState,
): void {
  for (const line of lines) {
    const parsed = parseSseLine(line);
    if (!parsed) continue;

    // 转发原始行给客户端（无论是否可解析）
    onData(parsed.raw);

    // [DONE] 信号 → 不处理
    if (parsed.isDone) continue;

    // 非 data: 行 → 已转发，但不用统计
    if (!line.startsWith("data: ")) continue;

    // 解析到 JSON chunk
    if (parsed.parsed) {
      state.totalChunks++;

      const choices = parsed.parsed.choices;
      const firstChoice = Array.isArray(choices) && choices.length > 0 ? (choices[0] as Record<string, unknown> | null) : null;
      const finishReason = firstChoice?.finish_reason;

      // 🔑 只有 finish_reason 非空的帧，其 usage 才是最终有效值
      if (finishReason && typeof finishReason === "string" && finishReason.length > 0) {
        state.finishReason = finishReason;
        const usage = parsed.parsed.usage;
        if (usage && typeof usage === "object") {
          const u = usage as Record<string, unknown>;
          const promptTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
          const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
          const totalTokens = typeof u.total_tokens === "number" ? u.total_tokens : promptTokens + completionTokens;
          state.lastValidUsage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          };
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// relayNonStream — 非流式转发
// ---------------------------------------------------------------------------

/**
 * 非流式请求转发：直接 fetch 上游 API，返回完整 JSON 响应。
 *
 * 4xx/5xx 响应 → 解析上游错误体 → throw UpstreamError
 *
 * @param upstreamUrl - 上游 API 完整 URL
 * @param apiKey - 上游 API Key（用于 Authorization header）
 * @param body - 请求体（已序列化为 JSON 字符串）
 * @param extraHeaders - 额外的请求头（可选）
 * @returns 上游返回的完整 JSON 响应体
 * @throws {UpstreamError} 上游返回 4xx/5xx 时抛出，附带 statusCode 和上游错误体
 *
 * @example
 * ```ts
 * const data = await relayNonStream("https://api.openai.com/v1/chat/completions", "sk-xxx", body);
 * ```
 */
export async function relayNonStream(
  upstreamUrl: string,
  apiKey: string,
  body: string,
  extraHeaders?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders,
  };

  const res = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body,
  });

  // 尝试解析响应体
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    // 非 JSON 响应体
  }

  if (!res.ok) {
    // 上游 4xx/5xx → 提取错误消息
    const errorMsg = extractUpstreamErrorMessage(parsed, res.status);
    throw new UpstreamError(res.status, errorMsg, parsed);
  }

  return parsed ?? {};
}

/**
 * 从上游错误响应中提取可读的错误消息
 */
function extractUpstreamErrorMessage(
  body: Record<string, unknown> | undefined,
  statusCode: number,
): string {
  if (!body) return `上游返回 ${statusCode}`;

  // OpenAI 风格: { error: { message: "..." } }
  const error = body.error;
  if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.message === "string") return errObj.message;
  }

  // 通用风格: { message: "..." }
  if (typeof body.message === "string") return body.message;

  return `上游返回 ${statusCode}`;
}
