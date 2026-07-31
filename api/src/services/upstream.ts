import { vendors } from "../db/schema/vendors";

/**
 * 供应商转发 service（§5 API 网关核心）
 * 将 OpenAI 兼容请求转发到所选供应商，支持：
 * - 供应商 baseUrl / API 格式
 * - 供应商认证（API Key 从 vendor 关联的 key 池取）
 * - 模型名映射（平台模型名 → 供应商 upstream_model）
 * - 超时控制
 * - 错误规范化
 */

export interface ForwardTarget {
  url: string;
  apiKey: string;
  headers?: Record<string, string>;
}

export interface ForwardResult {
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

const DEFAULT_TIMEOUT_MS = 60000; // 对齐 SPEC-§5 CORE-008 供应商 ≤60s

/**
 * 解析供应商端点 + 认证头（简化：本实现先支持单 key；key 池 §25 后续）
 * @param vendor 供应商记录
 * @param vendorApiKey 供应商 API Key（从关联表读取，Phase 1 简化直接传入）
 */
function buildRequest(
  vendor: typeof vendors.$inferSelect,
  vendorApiKey: string,
  path: string, // 如 /chat/completions
): { url: string; headers: Record<string, string> } {
  const base = (vendor.baseUrl ?? "").replace(/\/$/, "");
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${vendorApiKey}`,
  };
  return { url, headers };
}

/**
 * 转发 OpenAI 兼容 chat/completions 请求
 */
export async function forwardChatCompletion(params: {
  vendor: typeof vendors.$inferSelect;
  vendorApiKey: string;
  upstreamModel: string;
  body: Record<string, unknown>;
}): Promise<ForwardResult> {
  const { vendor, vendorApiKey, upstreamModel, body } = params;
  const start = Date.now();

  // 替换模型名为供应商 upstream model
  const payload = { ...body, model: upstreamModel };

  const { url, headers } = buildRequest(vendor, vendorApiKey, "/chat/completions");

  // 超时控制
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const text = await res.text();
    let data: Record<string, unknown> | undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      // 非 JSON 响应
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        latencyMs,
        error: {
          code: `UPSTREAM_${res.status}`,
          message: typeof data?.error === "object" && data.error && "message" in (data.error as object) ? String((data.error as any).message) : `上游返回 ${res.status}`,
        },
      };
    }

    // 解析 usage（OpenAI 协议）
    const usage = extractUsage(data);
    return { ok: true, status: res.status, data, latencyMs, usage };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      latencyMs: Date.now() - start,
      error: {
        code: e instanceof Error && e.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        message: e instanceof Error ? e.message : "上游调用异常",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 从 OpenAI 协议响应提取 token 用量 */
function extractUsage(data: Record<string, unknown> | undefined): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const usage = (data as any)?.usage;
  const inputTokens = Number(usage?.prompt_tokens ?? 0);
  const outputTokens = Number(usage?.completion_tokens ?? 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number(usage?.total_tokens ?? inputTokens + outputTokens),
  };
}
