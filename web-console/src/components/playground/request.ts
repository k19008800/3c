/**
 * Playground 调试请求工具 — 统一非流式 JSON / 流式 SSE 两种响应
 *
 * 全部端点经 web-console 的 /api 代理访问后端双注册别名
 * （/api/v1/v1/...，见 docs/api-contract.md §4），与 PlaygroundPage 既有
 * /api/v1/v1/chat/completions 用法一致，dev（vite 5175）与 portal（5177）拓扑均可用。
 *
 * @module components/playground
 */

import type { ProxyResult, StreamEvent } from "./types";

/** 解析单个 SSE 块（event: 行 + data: 行，空行分隔） */
function parseSseBlock(block: string): StreamEvent | null {
  const lines = block.split("\n");
  let event: string | null = null;
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataParts.push(line.slice(5).replace(/^\s/, ""));
    }
  }
  if (dataParts.length === 0) return null;
  return { event, data: dataParts.join("\n") };
}

/** 从错误响应中提取可读 message（OpenAI / Anthropic / 业务错误形状兼容） */
function extractErrorMessage(json: unknown, text: string, status: number): string {
  if (json && typeof json === "object") {
    const anyJson = json as Record<string, unknown>;
    const errObj = anyJson.error;
    if (errObj && typeof errObj === "object") {
      const m = (errObj as Record<string, unknown>).message;
      if (typeof m === "string") return m;
    }
    if (typeof anyJson.message === "string") return anyJson.message as string;
  }
  return `HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}

/**
 * 发送调试请求
 *
 * @param opts.path - 完整内部路径，如 /api/v1/v1/rerank
 * @param opts.apiKey - 完整 API Key（空则不携带 Authorization）
 * @param opts.body - JSON 请求体
 * @param opts.headers - 附加请求头（如 Anthropic 兼容端点可覆盖）
 * @param opts.onStreamEvent - 流式解析回调（逐事件触发，可用于实时渲染）
 * @param opts.signal - AbortSignal（取消）
 */
export async function sendDebugRequest(opts: {
  path: string;
  apiKey: string;
  body: unknown;
  headers?: Record<string, string>;
  onStreamEvent?: (ev: StreamEvent) => void;
  signal?: AbortSignal;
}): Promise<ProxyResult> {
  const started = performance.now();

  let res: Response;
  try {
    res = await fetch(opts.path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey.trim() ? { Authorization: `Bearer ${opts.apiKey.trim()}` } : {}),
        ...opts.headers,
      },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - started);
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      latencyMs,
      json: null,
      text: "",
      streamEvents: [],
      error: aborted ? "请求已取消" : (err?.message ?? "网络请求失败，请检查 API 服务是否可用"),
    };
  }
  const latencyMs = Math.round(performance.now() - started);
  const contentType = res.headers.get("content-type") ?? "";

  // ── 流式 SSE ──
  if (contentType.includes("text/event-stream")) {
    const streamEvents: StreamEvent[] = [];
    try {
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const ev = parseSseBlock(block);
            if (ev) {
              streamEvents.push(ev);
              opts.onStreamEvent?.(ev);
            }
          }
        }
      }
    } catch {
      /* 流中断：保留已收到的部分事件 */
    }
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      json: null,
      text: "",
      streamEvents,
      error: res.ok ? null : `HTTP ${res.status}（流式响应失败）`,
    };
  }

  // ── 非流式 ──
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应（保留 text 兜底展示） */
  }
  return {
    ok: res.ok,
    status: res.status,
    latencyMs,
    json,
    text,
    streamEvents: [],
    error: res.ok ? null : extractErrorMessage(json, text, res.status),
  };
}
