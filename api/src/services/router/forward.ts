// ============================================================
//  请求转发（非流式 + 流式）
// ============================================================

import type { FastifyRequest } from "fastify";
import { AppError } from "../auth-service/index.js";
import type { VendorModelRoute, ForwardResult, StreamForwardResult } from "./types.js";
import { mockVendorResponse, mockStreamResponse, SIMULATION } from "./simulation.js";

/** OpenAI 流式响应中提取 usage 的模式 */
const STREAM_USAGE_RE = /"usage"\s*:/;

/**
 * 构建上游请求 headers
 */
function buildUpstreamHeaders(
  route: VendorModelRoute,
  requestHeaders: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {};

  // 转发 HTTP 头（白名单）
  const forwardHeaders = [
    "content-type",
    "accept",
    "accept-encoding",
    "user-agent",
  ];

  for (const h of forwardHeaders) {
    const val = requestHeaders[h.toLowerCase()];
    if (val) {
      // 如果上游原样返回，不设 content-encoding
      if (h === "accept-encoding") continue;
      headers[h] = val;
    }
  }

  // 替换 Authorization 为厂商 API Key
  headers["authorization"] = `Bearer ${route.apiKeyPlain}`;

  return headers;
}

/**
 * 替换请求 body 中的 model name 为上游模型名
 */
function transformRequestBody(
  body: string,
  upstreamModelName: string,
): string {
  try {
    const parsed = JSON.parse(body);
    parsed.model = upstreamModelName;
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

/**
 * 非流式转发
 */
export async function forwardRequest(
  route: VendorModelRoute,
  request: FastifyRequest,
): Promise<ForwardResult> {
  // ── 仿真模式：直接返回 Mock 响应 ──
  if (SIMULATION) {
    return mockVendorResponse(route, (request as any).body);
  }

  const rawBody = (request as any).body;
  if (!rawBody) {
    throw new AppError("EMPTY_BODY", "请求体为空", 400);
  }

  const bodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
  const transformedBody = transformRequestBody(bodyStr, route.upstreamModelName);

  const requestHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (typeof v === "string") requestHeaders[k] = v;
  }

  const headers = buildUpstreamHeaders(route, requestHeaders);

  const upstreamResponse = await fetch(route.apiEndpoint, {
    method: "POST",
    headers,
    body: transformedBody,
  });

  const responseBody: any = await upstreamResponse.json();

  let usage: ForwardResult["usage"] = null;
  if (responseBody?.usage) {
    usage = {
      promptTokens: responseBody.usage.prompt_tokens ?? 0,
      completionTokens: responseBody.usage.completion_tokens ?? 0,
      totalTokens: responseBody.usage.total_tokens ?? 0,
    };
  }

  // 替换返回中的 model 名
  if (responseBody?.model) {
    responseBody.model = route.upstreamModelName;
    // 注：这里保留 upstream 模型名在返回中，前端看到的是上游名
    // 如果需要显示统一名，可以在 proxy route 中再替换
  }

  const responseHeaders: Record<string, string> = {};
  upstreamResponse.headers.forEach((v, k) => {
    // 不转发 transfer-encoding（Fastify 会处理）
    if (k.toLowerCase() !== "transfer-encoding") {
      responseHeaders[k] = v;
    }
  });

  return {
    status: upstreamResponse.status,
    headers: responseHeaders,
    body: responseBody,
    usage,
  };
}

/**
 * 流式转发
 * 使用 TransformStream 逐块处理 SSE 数据
 */
export async function forwardStreamRequest(
  route: VendorModelRoute,
  request: FastifyRequest,
): Promise<StreamForwardResult> {
  // ── 仿真模式：直接返回 Mock 流式响应 ──
  if (SIMULATION) {
    return mockStreamResponse(route, (request as any).body);
  }

  const rawBody = (request as any).body;
  if (!rawBody) {
    throw new AppError("EMPTY_BODY", "请求体为空", 400);
  }

  const bodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
  const bodyObj = JSON.parse(bodyStr);

  // 确保 stream=true
  bodyObj.stream = true;
  bodyObj.model = route.upstreamModelName;
  const transformedBody = JSON.stringify(bodyObj);

  const requestHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (typeof v === "string") requestHeaders[k] = v;
  }

  const headers = buildUpstreamHeaders(route, requestHeaders);

  const upstreamResponse = await fetch(route.apiEndpoint, {
    method: "POST",
    headers,
    body: transformedBody,
  });

  if (!upstreamResponse.body) {
    throw new AppError("UPSTREAM_NO_BODY", "上游响应无 body", 502);
  }

  const responseHeaders: Record<string, string> = {};
  upstreamResponse.headers.forEach((v, k) => {
    if (k.toLowerCase() !== "transfer-encoding") {
      responseHeaders[k] = v;
    }
  });

  // ── TransformStream: 解析 SSE，捕获 usage，转发块 ──

  const TEXT_DECODER = new TextDecoder();
  const TEXT_ENCODER = new TextEncoder();

  type UsageInfo = { promptTokens: number; completionTokens: number; totalTokens: number };
  let usageResult: UsageInfo | null = null;
  let resolveUsage!: (v: UsageInfo | null) => void;
  const usagePromise = new Promise<UsageInfo | null>((resolve) => {
    resolveUsage = resolve;
  });

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = TEXT_DECODER.decode(chunk, { stream: true });

      // 检查当前 chunk 是否包含 usage 信息
      // OpenAI SSE 格式：data: {"id":"...","choices":[],"usage":{...}}
      if (STREAM_USAGE_RE.test(text)) {
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.usage) {
                usageResult = {
                  promptTokens: data.usage.prompt_tokens ?? data.usage.promptTokens ?? 0,
                  completionTokens: data.usage.completion_tokens ?? data.usage.completionTokens ?? 0,
                  totalTokens: data.usage.total_tokens ?? data.usage.totalTokens ?? 0,
                };
              }
            } catch {
              // 某些行可能不是 JSON（如 [DONE]），忽略
            }
          }
        }
      }

      // 转发原始块
      controller.enqueue(chunk);
    },

    flush(controller) {
      resolveUsage(usageResult);
      controller.terminate();
    },
  });

  // 如果上游 body 是 ReadableStream，pipe 到 transformStream
  // 使用 pipeTo 但不要阻塞
  upstreamResponse.body.pipeTo(transformStream.writable).catch((err) => {
    // 如果流中断，确保 usage 仍被 resolve
    resolveUsage(usageResult);
  });

  return {
    status: upstreamResponse.status,
    headers: responseHeaders,
    stream: transformStream.readable,
    usagePromise,
  };
}
