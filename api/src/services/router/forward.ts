// ============================================================
//  请求转发（非流式 + 流式）
// ============================================================

import type { FastifyRequest } from "fastify";
import { AppError } from "../auth-service/index.js";
import type { VendorModelRoute, ForwardResult, StreamForwardResult } from "./types.js";
import { mockVendorResponse, mockStreamResponse, SIMULATION } from "./simulation.js";

/** OpenAI 流式响应中提取 usage 的模式 */
const STREAM_USAGE_RE = /"usage"\s*:/;

// ── 供应商级并发控制 ──
// 防止同一供应商被瞬间大量并发请求打垮
// key: vendorId, value: { current: number, max: number }
const vendorConcurrentMap = new Map<number, { current: number; max: number }>();
const VENDOR_CONCURRENT_DEFAULT = 50; // 每个供应商默认最大并发数

// 延迟加载负载均衡器单例
let _lbInstance: import("./vendor-load-balancer.js").VendorLoadBalancer | null = null;

/**
 * 获取负载均衡器单例
 * 首次加载通过动态 import 避免循环依赖
 */
async function ensureLoadBalancerLoaded(): Promise<import("./vendor-load-balancer.js").VendorLoadBalancer> {
  if (!_lbInstance) {
    const { getLoadBalancer: getLB } = await import("./vendor-load-balancer.js");
    _lbInstance = getLB();
  }
  return _lbInstance;
}

/**
 * 同步获取已加载的负载均衡器（必须在 ensureLoadBalancerLoaded 之后调用）
 */
function getLoadBalancerSync(): import("./vendor-load-balancer.js").VendorLoadBalancer | null {
  return _lbInstance;
}

/**
 * 获取供应商最大并发数
 * 优先从 VendorLoadBalancer 读取动态值，失败则回退到本地 Map
 */
function getVendorMaxConcurrent(vendorId: number): number {
  // 尝试从负载均衡器获取动态值
  try {
    const lb = getLoadBalancerSync();
    if (lb) {
      const lbMax = lb.getMaxConcurrent(vendorId);
      if (lbMax !== VENDOR_CONCURRENT_DEFAULT) {
        return lbMax;
      }
    }
  } catch {
    // 负载均衡器未就绪，使用本地值
  }
  const entry = vendorConcurrentMap.get(vendorId);
  return entry?.max ?? VENDOR_CONCURRENT_DEFAULT;
}

/**
 * 尝试获取供应商并发令牌
 * @returns 获取成功返回 true，失败（并发已达上限）返回 false
 */
function tryAcquireVendorToken(vendorId: number): boolean {
  let entry = vendorConcurrentMap.get(vendorId);
  if (!entry) {
    entry = { current: 0, max: VENDOR_CONCURRENT_DEFAULT };
    vendorConcurrentMap.set(vendorId, entry);
  }

  // 从已加载的负载均衡器获取动态 max
  try {
    const lb = getLoadBalancerSync();
    if (lb) {
      const lbMax = lb.getMaxConcurrent(vendorId);
      entry.max = lbMax;
      // 通知负载均衡器
      lb.incrementConcurrent(vendorId);
    }
  } catch {
    // 负载均衡器未就绪，使用本地值
  }

  if (entry.current >= entry.max) return false;
  entry.current++;
  return true;
}

/**
 * 释放供应商并发令牌
 */
function releaseVendorToken(vendorId: number): void {
  const entry = vendorConcurrentMap.get(vendorId);
  if (entry && entry.current > 0) entry.current--;
  // 通知负载均衡器
  try {
    const lb = getLoadBalancerSync();
    if (lb) {
      lb.decrementConcurrent(vendorId);
    }
  } catch {
    // 负载均衡器未就绪，忽略
  }
}

/**
 * 更新供应商并发上限（允许外部通过 system_configs 动态调整）
 */
export function setVendorConcurrentMax(vendorId: number, max: number): void {
  let entry = vendorConcurrentMap.get(vendorId);
  if (!entry) {
    entry = { current: 0, max };
    vendorConcurrentMap.set(vendorId, entry);
  } else {
    entry.max = max;
  }
}

/**
 * 获取当前所有供应商并发状态（用于监控）
 */
export function getVendorConcurrentStatus(): Record<number, { current: number; max: number }> {
  const result: Record<number, { current: number; max: number }> = {};
  for (const [vendorId, entry] of vendorConcurrentMap) {
    result[vendorId] = { current: entry.current, max: entry.max };
  }
  return result;
}

/**
 * 带并发控制的转发包装器
 * 包装非流式和流式转发，确保同一供应商不会超过并发上限
 */
async function withVendorConcurrency<T>(
  vendorId: number,
  vendorName: string,
  fn: () => Promise<T>,
): Promise<T> {
  // 确保负载均衡器已加载（非阻塞，首次调用时初始化）
  try {
    await ensureLoadBalancerLoaded();
  } catch {
    // 非关键，LB 可用时增强控制，不可用时也不阻塞转发
  }

  if (!tryAcquireVendorToken(vendorId)) {
    throw new AppError(
      "VENDOR_CONCURRENT_LIMIT",
      `供应商 ${vendorName} 并发请求已达上限（${getVendorMaxConcurrent(vendorId)}），请稍后重试`,
      429,
    );
  }
  try {
    return await fn();
  } finally {
    releaseVendorToken(vendorId);
  }
}

/**
 * 从上游响应中提取 usage 信息
 */
function extractUsage(responseBody: any): ForwardResult["usage"] {
  if (responseBody?.usage) {
    return {
      promptTokens: responseBody.usage.prompt_tokens ?? 0,
      completionTokens: responseBody.usage.completion_tokens ?? 0,
      totalTokens: responseBody.usage.total_tokens ?? 0,
    };
  }
  return null;
}

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
  return withVendorConcurrency(route.vendorId, route.vendorName, async () => {
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
    const usage = extractUsage(responseBody);

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
  });
}

/**
 * 流式转发
 * 使用 TransformStream 逐块处理 SSE 数据
 */
export async function forwardStreamRequest(
  route: VendorModelRoute,
  request: FastifyRequest,
): Promise<StreamForwardResult> {
  return withVendorConcurrency(route.vendorId, route.vendorName, async () => {
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

    // ── TransformStream: 解析 SSE，捕获 usage，收集流内容，转发块 ──

    const TEXT_DECODER = new TextDecoder();
    const TEXT_ENCODER = new TextEncoder();

    type UsageInfo = { promptTokens: number; completionTokens: number; totalTokens: number };
    let usageResult: UsageInfo | null = null;
    let resolveUsage!: (v: UsageInfo | null) => void;
    const usagePromise = new Promise<UsageInfo | null>((resolve) => {
      resolveUsage = resolve;
    });

    // 收集流式内容（用于风险分析记录，限制最大 100KB）
    const MAX_COLLECTED_CONTENT = 100 * 1024;
    let collectedContent = "";

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = TEXT_DECODER.decode(chunk, { stream: true });

        // 收集内容（仅文本部分，限制大小）
        if (collectedContent.length < MAX_COLLECTED_CONTENT) {
          collectedContent += text;
          if (collectedContent.length > MAX_COLLECTED_CONTENT) {
            collectedContent = collectedContent.slice(0, MAX_COLLECTED_CONTENT) + "... [截断]";
          }
        }

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
      collectedContent: collectedContent.length > 0 ? collectedContent : undefined,
    };
  });
}
