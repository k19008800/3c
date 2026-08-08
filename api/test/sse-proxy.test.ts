/**
 * SSE 流式代理测试 — 覆盖 8 个核心 case
 *
 * 测试范围：
 * - streamRelay: 流式 SSE 解析 + 状态累积
 * - relayNonStream: 非流式 passthrough + 错误处理
 * - SseLineBuffer: 跨 buffer 行拼接
 *
 * @see development-plan.md §1.2 SSE 流式转发
 */
import { describe, it, expect, vi } from "vitest";
import {
  streamRelay,
  relayNonStream,
  UpstreamError,
  SseLineBuffer,
  parseSseLine,
} from "../src/services/upstream/index";
import type { StreamState } from "../src/services/upstream/index";

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * 创建模拟上游流式响应的 ReadableStream
 *
 * @param chunks - 字符串数组，每个元素代表一次 read() 返回的文本内容
 * @param errorAfter - 可选：在第 N 次 pull 后抛出错误（0-indexed）
 */
function createMockStream(chunks: string[], errorAfter?: number): ReadableStream<Uint8Array> {
  let count = 0;
  return new ReadableStream({
    pull(controller) {
      if (errorAfter !== undefined && count > errorAfter) {
        controller.error(new Error("upstream connection lost"));
        return;
      }
      if (count < chunks.length) {
        controller.enqueue(encoder.encode(chunks[count]!));
        count++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * 收集 onData 回调接收到的所有行
 */
function createCollector(): { lines: string[]; onData: (line: string) => void } {
  const lines: string[] = [];
  return {
    lines,
    onData: (line: string) => { lines.push(line); },
  };
}

// ---------------------------------------------------------------------------
// 核心 SSE 解析测试
// ---------------------------------------------------------------------------

describe("SSE 流式代理（§1.2）", () => {
  // --- Case 1 ---
  it("正常流式完成 → 收到 [DONE]，返回完整 StreamState 含 usage", async () => {
    const mockStream = createMockStream([
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"},"index":0}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ]);

    const collector = createCollector();
    const state = await streamRelay(mockStream, collector.onData);

    // StreamState 包含最终 usage
    expect(state.lastValidUsage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    expect(state.finishReason).toBe("stop");
    expect(state.totalChunks).toBe(3);

    // 客户端收到所有 4 行（含 [DONE]）
    expect(collector.lines).toHaveLength(4);
    expect(collector.lines[3]).toBe("data: [DONE]");
  });

  // --- Case 2 ---
  it("中断但有 usage → 采信最后一帧 usage（finish_reason 非空）", async () => {
    // chunk 0 和 1 有 delta，chunk 2 有 finish_reason + usage，chunk 2 后网络断开
    const mockStream = createMockStream(
      [
        'data: {"id":"cmpl-2","choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n',
        'data: {"id":"cmpl-2","choices":[{"delta":{"content":" there"},"index":0}]}\n\n',
        'data: {"id":"cmpl-2","choices":[{"delta":{},"index":0,"finish_reason":"length"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
      ],
      2, // 第 2 个 chunk 后抛错误（即 index > 2 时）
    );

    const state: StreamState = { lastValidUsage: null, totalChunks: 0, finishReason: null };
    const collector = createCollector();

    let thrown = false;
    try {
      await streamRelay(mockStream, collector.onData, state);
    } catch (err) {
      thrown = true;
      expect((err as Error).message).toContain("upstream connection lost");
    }
    expect(thrown).toBe(true);

    // state 被修改为累积值
    expect(state.lastValidUsage).toEqual({
      prompt_tokens: 5,
      completion_tokens: 2,
      total_tokens: 7,
    });
    expect(state.finishReason).toBe("length");
    expect(state.totalChunks).toBe(3);
  });

  // --- Case 3 ---
  it("中断无 usage → StreamState.lastValidUsage 为 null（外层负责 fallback）", async () => {
    // 只有 delta chunk，没有 finish_reason，没有 usage
    const mockStream = createMockStream(
      [
        'data: {"id":"cmpl-3","choices":[{"delta":{"content":"Partial"},"index":0}]}\n\n',
        'data: {"id":"cmpl-3","choices":[{"delta":{"content":" response"},"index":0}]}\n\n',
      ],
      1, // index > 1 时抛错误
    );

    const state: StreamState = { lastValidUsage: null, totalChunks: 0, finishReason: null };
    const collector = createCollector();

    let thrown = false;
    try {
      await streamRelay(mockStream, collector.onData, state);
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);

    // 没有 finish_reason 的 chunk → lastValidUsage 保持 null
    expect(state.lastValidUsage).toBeNull();
    expect(state.finishReason).toBeNull();
    expect(state.totalChunks).toBe(2);
  });

  // --- Case 4 ---
  it("chunk 跨 buffer 边界 → 分两次收到后正确拼接解析", async () => {
    // 第一段：data: {"cho  第二段：ices":[...]} → 拼接后能正确解析
    const mockStream = createMockStream([
      'data: {"cho',
      'ices":[{"delta":{"content":"cross-boundary"},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n',
    ]);

    const collector = createCollector();
    const state = await streamRelay(mockStream, collector.onData);

    // 跨 buffer 拼接后正确解析
    expect(state.lastValidUsage).toEqual({
      prompt_tokens: 3,
      completion_tokens: 1,
      total_tokens: 4,
    });
    expect(state.finishReason).toBe("stop");
    expect(state.totalChunks).toBe(1);
  });

  // --- Case 5 ---
  it("空 chunk：上游返回 data: {} → 不崩溃", async () => {
    const mockStream = createMockStream([
      'data: {}\n\n',
      'data: {"choices":[{"delta":{"content":"ok"},"index":0}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const collector = createCollector();
    const state = await streamRelay(mockStream, collector.onData);

    // 空 JSON 对象不崩溃，被正确解析但无 choices/usage
    expect(state.totalChunks).toBe(2); // 空 {} + 有效 chunk
    expect(state.lastValidUsage).toBeNull(); // 没有 finish_reason 的 chunk

    // 3 行都转发了
    expect(collector.lines).toHaveLength(3);
  });

  // --- Case 6 ---
  it("多行 data: → 上游一次返回多个 data: 行 → 逐行处理", async () => {
    // 一次 read 返回多个 data: 行（用 \n 分隔）
    const multiLineChunk = [
      'data: {"id":"a","choices":[{"delta":{"content":"1"},"index":0}]}',
      'data: {"id":"a","choices":[{"delta":{"content":"2"},"index":0}]}',
      'data: {"id":"a","choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}',
      "", // 空行 → 被过滤
      "data: [DONE]",
      "", // 结尾空行
    ].join("\n");

    const mockStream = createMockStream([multiLineChunk]);

    const collector = createCollector();
    const state = await streamRelay(mockStream, collector.onData);

    // 正确解析到最后一帧 usage
    expect(state.lastValidUsage).toEqual({
      prompt_tokens: 2,
      completion_tokens: 2,
      total_tokens: 4,
    });
    expect(state.finishReason).toBe("stop");
    expect(state.totalChunks).toBe(3);

    // 5 行（3 data + 1 [DONE] + 空行被过滤）
    expect(collector.lines).toHaveLength(4);
  });

  // --- Case 7 ---
  it("非流式 → passthrough 原样返回完整 JSON", async () => {
    const mockResponse = {
      id: "cmpl-nonstream",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello from non-stream" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    };

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
    }) as unknown as typeof fetch;

    try {
      const result = await relayNonStream(
        "https://api.openai.com/v1/chat/completions",
        "sk-test-key",
        JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        }),
      );

      // 原样返回完整 JSON
      expect(result).toEqual(mockResponse);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- Case 8 ---
  it("上游返回 4xx/5xx → throw UpstreamError", async () => {
    const mockErrorBody = { error: { message: "Incorrect API key provided", type: "invalid_request_error" } };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify(mockErrorBody),
    }) as unknown as typeof fetch;

    try {
      await relayNonStream(
        "https://api.openai.com/v1/chat/completions",
        "sk-invalid",
        JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
      );
      // 不应该到这里
      expect.unreachable("Expected UpstreamError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamError);
      const ue = err as UpstreamError;
      expect(ue.statusCode).toBe(401);
      expect(ue.message).toBe("Incorrect API key provided");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- Case 8b: 5xx ---
  it("上游返回 500 → throw UpstreamError with status 500", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"message":"Internal Server Error"}',
    }) as unknown as typeof fetch;

    try {
      await relayNonStream(
        "https://api.openai.com/v1/chat/completions",
        "sk-test",
        JSON.stringify({ model: "gpt-4o", messages: [] }),
      );
      expect.unreachable("Expected UpstreamError");
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamError);
      const ue = err as UpstreamError;
      expect(ue.statusCode).toBe(500);
      expect(ue.message).toBe("Internal Server Error");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// SseLineBuffer 独立测试
// ---------------------------------------------------------------------------

describe("SseLineBuffer 行缓冲", () => {
  it("完整行 → 立即返回", () => {
    const buf = new SseLineBuffer();
    const lines = buf.feed("data: hello\n");
    expect(lines).toEqual(["data: hello"]);
  });

  it("行跨两次 feed → 拼接后返回", () => {
    const buf = new SseLineBuffer();
    const lines1 = buf.feed('data: {"cho');
    expect(lines1).toEqual([]); // 不完整，无 \n

    const lines2 = buf.feed('ices":[{"delta":{"content":"x"}]}\n');
    expect(lines2).toEqual(['data: {"choices":[{"delta":{"content":"x"}]}']);
  });

  it("多行 + 不完整行 → 返回完整行，保留不完整行", () => {
    const buf = new SseLineBuffer();
    const lines = buf.feed("line1\nline2\nline3_partial");
    expect(lines).toEqual(["line1", "line2"]);
    // line3_partial 留在缓冲区
    const flushed = buf.flush();
    expect(flushed).toEqual(["line3_partial"]);
  });

  it("flush 后 buffer 清空", () => {
    const buf = new SseLineBuffer();
    buf.feed("incomplete");
    expect(buf.flush()).toEqual(["incomplete"]);
    expect(buf.flush()).toEqual([]);
  });

  it("reset 清空缓冲区", () => {
    const buf = new SseLineBuffer();
    buf.feed("partial_data");
    buf.reset();
    expect(buf.flush()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseSseLine 独立测试
// ---------------------------------------------------------------------------

describe("parseSseLine SSE 行解析", () => {
  it("解析标准 data: JSON 行", () => {
    const result = parseSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}');
    expect(result).not.toBeNull();
    expect(result!.isDone).toBe(false);
    expect(result!.parsed).toEqual({ choices: [{ delta: { content: "hi" } }] });
  });

  it("识别 [DONE]", () => {
    const result = parseSseLine("data: [DONE]");
    expect(result).not.toBeNull();
    expect(result!.isDone).toBe(true);
  });

  it("非 data: 行 → 原样保留 raw", () => {
    const result = parseSseLine("event: message");
    expect(result).not.toBeNull();
    expect(result!.raw).toBe("event: message");
    expect(result!.isDone).toBe(false);
    expect(result!.parsed).toBeUndefined();
  });

  it("行尾 \\r → 正确去除", () => {
    const result = parseSseLine('data: {"x":1}\r');
    expect(result).not.toBeNull();
    expect(result!.parsed).toEqual({ x: 1 });
  });

  it("非 JSON data → parsed 为 undefined", () => {
    const result = parseSseLine("data: just some text");
    expect(result).not.toBeNull();
    expect(result!.parsed).toBeUndefined();
    expect(result!.data).toBe("just some text");
  });
});
