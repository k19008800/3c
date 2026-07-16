// ============================================================
//  3cloud (3C) — Token 代理路由引擎 (Business Logic)
// ============================================================
//
// ── 路由全流程 ──
//
// 【入口 → 出口 完整链路】
//   1. 鉴权: Bearer Token → SHA-256 hash → api_keys 表查询 → 提取 userId
//   2. 余额检查: users.balance > alert_stop_balance (otherwise 402)
//   3. 模型解析: model name → models 表 (status=true) → 获取 modelId (内存 Map 缓存)
//   4. 限流检查: Redis 滑动窗口 (Key级 → 用户级 → 全局级)
//      - 超限 → 429 + Retry-After header + call_logs(status=rate_limited)
//   5. 路由策略选择 (selectRoute):
//      - lowest_price (默认): queryAvailableRoutes() 按 sellPriceInput ASC 排序, 取第一个
//      - weighted_random: candidates.reduce 总 weight, Math.random() * totalWeight 加权选择
//      - manual: 按 preferredVendorId 精确匹配
//   6. 上游转发:
//      - 非流式 (forwardRequest): POST → vendor endpoint, model name → upstreamModelName, auth → vendor API Key (AES解密)
//      - 流式 (forwardStreamRequest): POST → SSE pipe through TransformStream, 捕获 usage, body.stream=true 强制设置
//   7. 计费: billing.charge() → 见 billing.ts
//
// 【路由候选查询 (queryAvailableRoutes)】
//   - JOIN vendor_models + vendors
//   - 过滤: vendorModels.status=true, isDown=false, vendors.status='active'
//   - 排序: ASC sellPriceInput
//   - apiKeyEncrypted → decryptApiKey() AES-256-GCM 解密
//
// 【熔断检查 (circuit-breaker)】
//   - selectRoute 内调用 shouldSkipVendor(vendorModelId) 过滤熔断候选
//   - 如果全部被熔断 → 放宽限制, 保留原 candidates (降级, 避免全不可用)
//   - 熔断服务异常 → catch 降级, 不阻塞请求
//
// 【健康检测 (独立于路由, vendor_models 表字段)】
//   - 被动检测: 每次调用后更新 healthScore (近50次滚动窗口)
//     success < 70% → degraded (权重降至 50%)
//     success < 30% → down (isDown=true)
//   - 主动检测: cron 每 5 分钟对 isDown 厂商发轻量探测请求
//     连续成功 3 次 → 恢复 active (isDown=false)
//
// 【降级策略】
//   - 首选厂商不可用 (isDown=true) → queryAvailableRoutes 自动排除
//   - circuit-breaker 全局熔断时 → 放行全部 candidates
//   - 所有厂商不可用 → NO_ROUTE error (503)
//
// 【流式处理 (forwardStreamRequest)】
//   - request body: stream=true 强制覆盖, model → upstreamModelName 替换
//   - TransformStream 逐块处理: 检查 "usage": 正则匹配 SSE data 行
//   - usagePromise: 流结束后 resolve usage (promptTokens, completionTokens, totalTokens)
//   - pipeTo 失败 → resolve usage 已有的数据 (防止泄漏)
//   - stream disconnect → proxy route 不调用 charge(), call_logs status=cancelled
//
// 【仿真模式 (SIMULATION)】
//   - 环境变量 SIMULATION=true 激活
//   - mockVendorResponse: 随机生成 promptTokens/completionTokens, 返回模拟 JSON
//   - mockStreamResponse: 分块 SSE 流, "好的/让我/想想/这个/问题。" + [DONE]
//   - 不发起真实 HTTP 请求
//
// 【超时与容错】
//   - fetch() 无显式 timeout → 由 proxy route 层 AbortController 控制
//   - upstream HTTP 4xx/5xx → 返回原始状态码 + body, 不切备用
//   - stream timeout/disconnect → TransformStream pipeTo catch → resolve usage

import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models, vendorModels, vendors } from "../db/schema.js";
import { decryptApiKey } from "./encryption.js";
import { AppError } from "./auth-service.js";
import type { FastifyRequest } from "fastify";

// ── 仿真模式 Mock ──

const SIMULATION = process.env.SIMULATION === "true";

/**
 * 仿真模式下生成模拟的上游响应（不发起真实 HTTP 请求）
 */
function mockVendorResponse(
  route: VendorModelRoute,
  rawBody: unknown,
): ForwardResult {
  // 估算 prompt tokens
  let promptTokens = 0;
  if (rawBody && typeof rawBody === "object") {
    const body = rawBody as any;
    if (body.messages) {
      promptTokens = JSON.stringify(body.messages).length / 2;
    } else if (body.input) {
      promptTokens = (typeof body.input === "string" ? body.input.length : JSON.stringify(body.input).length) / 2;
    }
  }
  promptTokens = Math.max(10, Math.min(8000, Math.round(promptTokens)));
  if (promptTokens < 100) promptTokens = Math.floor(Math.random() * 2000) + 100;

  const completionTokens = Math.floor(Math.random() * 3000) + 50;
  const totalTokens = promptTokens + completionTokens;

  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: {
      id: "chatcmpl-sim-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: route.upstreamModelName,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "这是一个仿真模式下的模拟回复。" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    },
    usage: { promptTokens, completionTokens, totalTokens },
  };
}

/**
 * 仿真模式下生成模拟的流式上游响应
 */
function mockStreamResponse(
  route: VendorModelRoute,
  rawBody: unknown,
): StreamForwardResult {
  let promptTokens = 0;
  if (rawBody && typeof rawBody === "object") {
    const body = rawBody as any;
    if (body.messages) {
      promptTokens = JSON.stringify(body.messages).length / 2;
    } else if (body.input) {
      promptTokens = (typeof body.input === "string" ? body.input.length : JSON.stringify(body.input).length) / 2;
    }
  }
  promptTokens = Math.max(10, Math.min(8000, Math.round(promptTokens)));
  if (promptTokens < 100) promptTokens = Math.floor(Math.random() * 2000) + 100;

  const completionTokens = Math.floor(Math.random() * 3000) + 50;
  const totalTokens = promptTokens + completionTokens;

  const usage = { promptTokens, completionTokens, totalTokens };

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  // 构造模拟的 SSE 流
  const deltaMessages = ["好的", "让我", "想想", "这个", "问题。"];
  for (const delta of deltaMessages) {
    const sseLine = `data: ${JSON.stringify({
      id: "chatcmpl-sim-" + Date.now(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: route.upstreamModelName,
      choices: [{
        index: 0,
        delta: { content: delta },
        finish_reason: null,
      }],
    })}\n\n`;
    chunks.push(encoder.encode(sseLine));
  }

  // 最后一块带 usage
  const finalLine = `data: ${JSON.stringify({
    id: "chatcmpl-sim-" + Date.now(),
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: route.upstreamModelName,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  })}\n\n`;
  chunks.push(encoder.encode(finalLine));
  chunks.push(encoder.encode("data: [DONE]\n\n"));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    stream,
    usagePromise: Promise.resolve(usage),
  };
}

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
    .where(and(eq(models.name, name), eq(models.status, true)))
    .limit(1);

  if (!model) {
    throw new AppError("MODEL_NOT_FOUND", `模型 "${name}" 不存在或已下架`, 404);
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

// ── 从 Key 分组中选择一个 Key ──

export async function selectKeyFromGroup(
  groupId: number,
  redis: any,
): Promise<{ apiKeyPlain: string; item: any } | null> {
  try {
    const { eq, and, asc } = await import("drizzle-orm");
    const { getDb } = await import("../db/index.js");
    const { vendorKeyGroups: vkg, vendorKeyGroupItems: vkgi } = await import("../db/schema.js");
    const { decryptApiKey } = await import("./encryption.js");
    const db = getDb();

    const [group] = await db.select().from(vkg).where(eq(vkg.id, groupId));
    if (!group || !group.status) return null;

    const items = await db
      .select()
      .from(vkgi)
      .where(and(eq(vkgi.groupId, groupId), eq(vkgi.status, true), eq(vkgi.isDown, false)))
      .orderBy(asc(vkgi.priority));

    if (items.length === 0) return null;

    let selected = items[0];
    switch (group.strategy) {
      case "round_robin": {
        const idx = await redis.incr(`keygroup:${groupId}:counter`);
        selected = items[idx % items.length];
        break;
      }
      case "weighted": {
        const totalWeight = items.reduce((s, i) => s + i.weight, 0);
        let r = Math.random() * totalWeight;
        for (const item of items) {
          r -= item.weight;
          if (r <= 0) { selected = item; break; }
        }
        break;
      }
      case "failover":
      case "priority":
      default:
        selected = items[0];
        break;
    }

    const apiKeyPlain = decryptApiKey(selected.apiKeyEncrypted);
    await db.update(vkgi)
      .set({ lastUsedAt: new Date(), totalCalls: selected.totalCalls + 1 })
      .where(eq(vkgi.id, selected.id));

    return { apiKeyPlain, item: selected };
  } catch (err) {
    console.warn("[Router] KeyGroup 选择失败，降级:", err);
    return null;
  }
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
