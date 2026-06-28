// ============================================================
//  3cloud (3C) — Token 代理路由引擎
//  智能路由：自动最低价 / 加权动态 / 手动指定
//  故障切换 + 多 Key 分摊
//  健康过滤 + AES 解密
// ============================================================

import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models, vendorModels, vendors } from "../db/schema.js";
import { decryptApiKey } from "./encryption.js";
import { AppError } from "./auth-service.js";
import type { FastifyRequest } from "fastify";

// ── 路由策略 ──

export type RoutingStrategy = "lowest_price" | "weighted_random" | "manual";

export interface RoutingOptions {
  modelName: string;           // 统一模型名（如 deepseek-v4-pro）
  userId: number;
  strategy?: RoutingStrategy;
  preferredVendorId?: number;  // manual 策略时指定
}

export interface VendorModelRoute {
  vendorModelId: number;
  vendorId: number;
  vendorName: string;
  modelId: number;
  upstreamModelName: string;
  apiEndpoint: string;
  apiKeyPlain: string;         // 已解密
  sellPriceInput: number;
  sellPriceOutput: number;
  weight: number;
  rpmLimit: number | null;
  tpmLimit: number | null;
  healthScore: number;
  isDown: boolean;
}

// ── 缓存：模型名 → modelId ──

const modelNameCache = new Map<string, number>();

async function resolveModelId(name: string): Promise<number> {
  // 先查内存缓存
  const cached = modelNameCache.get(name);
  if (cached !== undefined) return cached;

  const db = getDb();
  const [model] = await db
    .select({ id: models.id })
    .from(models)
    .where(eq(models.name, name))
    .limit(1);

  if (!model) {
    throw new AppError("MODEL_NOT_FOUND", `模型 "${name}" 不存在`, 404);
  }

  modelNameCache.set(name, model.id);
  return model.id;
}

// ── 查询可用路由候选 ──

async function queryAvailableRoutes(modelId: number): Promise<VendorModelRoute[]> {
  const db = getDb();

  const rows = await db
    .select({
      vendorModelId: vendorModels.id,
      vendorId: vendorModels.vendorId,
      vendorName: vendors.name,
      modelId: vendorModels.modelId,
      upstreamModelName: vendorModels.upstreamModelName,
      apiEndpoint: vendorModels.apiEndpoint,
      apiKeyEncrypted: vendorModels.apiKeyEncrypted,
      sellPriceInput: vendorModels.sellPriceInput,
      sellPriceOutput: vendorModels.sellPriceOutput,
      weight: vendorModels.weight,
      rpmLimit: vendorModels.rpmLimit,
      tpmLimit: vendorModels.tpmLimit,
      healthScore: vendorModels.healthScore,
      isDown: vendorModels.isDown,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .where(
      and(
        eq(vendorModels.modelId, modelId),
        eq(vendorModels.status, true),
        eq(vendorModels.isDown, false),
        eq(vendors.status, "active"),
      )
    )
    .orderBy(asc(vendorModels.sellPriceInput));

  return rows.map((r) => ({
    vendorModelId: r.vendorModelId,
    vendorId: r.vendorId,
    vendorName: r.vendorName,
    modelId: r.modelId,
    upstreamModelName: r.upstreamModelName,
    apiEndpoint: r.apiEndpoint,
    apiKeyPlain: decryptApiKey(r.apiKeyEncrypted),
    sellPriceInput: Number(r.sellPriceInput),
    sellPriceOutput: Number(r.sellPriceOutput),
    weight: r.weight,
    rpmLimit: r.rpmLimit,
    tpmLimit: r.tpmLimit,
    healthScore: Number(r.healthScore ?? 1),
    isDown: r.isDown,
  }));
}

// ── 按策略选择 ──

function pickByStrategy(
  candidates: VendorModelRoute[],
  strategy: RoutingStrategy,
  preferredVendorId?: number,
): VendorModelRoute {
  if (candidates.length === 0) {
    throw new AppError("NO_ROUTE", "该模型暂无可用上游厂商", 503);
  }

  switch (strategy) {
    case "lowest_price":
      // 已按 sellPriceInput ASC 排序，取第一个
      return candidates[0];

    case "weighted_random": {
      const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight <= 0) return candidates[0];

      let rand = Math.random() * totalWeight;
      for (const c of candidates) {
        rand -= c.weight;
        if (rand <= 0) return c;
      }
      return candidates[candidates.length - 1];
    }

    case "manual": {
      if (!preferredVendorId) {
        throw new AppError("MANUAL_NEEDS_VENDOR", "手动路由需要指定 preferredVendorId", 400);
      }
      const match = candidates.find((c) => c.vendorId === preferredVendorId);
      if (!match) {
        throw new AppError(
          "VENDOR_NOT_AVAILABLE",
          `指定的厂商 (ID ${preferredVendorId}) 对该模型不可用或已下线`,
          400,
        );
      }
      return match;
    }

    default:
      return candidates[0];
  }
}

// ── 对外接口：选择最佳厂商-模型路由（含熔断） ──

export async function selectRoute(options: RoutingOptions): Promise<VendorModelRoute> {
  const modelId = await resolveModelId(options.modelName);
  const strategy = options.strategy ?? "lowest_price";

  let candidates = await queryAvailableRoutes(modelId);

  // 熔断检查：过滤掉熔断中的厂商
  try {
    const { shouldSkipVendor } = await import("./circuit-breaker.js");
    const filtered: VendorModelRoute[] = [];
    for (const c of candidates) {
      const skip = await shouldSkipVendor(c.vendorModelId);
      if (!skip) {
        filtered.push(c);
      }
    }
    // 如果全被熔断，放宽限制，允许最低价的熔断厂商通过（总比不可用强）
    candidates = filtered.length > 0 ? filtered : candidates;
  } catch (err) {
    // 熔断服务异常时降级，不阻塞请求
    console.warn("[Router] 熔断检查异常，跳过:", err);
  }

  return pickByStrategy(candidates, strategy, options.preferredVendorId);
}

// ── 清除模型名缓存（管理员添加新模型后调用） ──

export function clearModelNameCache() {
  modelNameCache.clear();
}

// ============================================================
//  请求转发（非流式 + 流式）
// ============================================================

/** OpenAI 流式响应中提取 usage 的模式 */
const STREAM_USAGE_RE = /"usage"\s*:/;

export interface ForwardResult {
  status: number;
  headers: Record<string, string>;
  body: any;                    // 非流式：JSON 对象
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

export interface StreamForwardResult {
  status: number;
  headers: Record<string, string>;
  /** 返回一个 TransformStream，外部可直接 pipe */
  stream: ReadableStream<Uint8Array>;
  /** 流结束后 resolve 的 usage 信息 */
  usagePromise: Promise<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>;
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
      // OpenAI SSE 格式：data: {"id":"...","choices":[...],"usage":{...}}
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
