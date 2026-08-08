/**
 * 模型连通性测试 service
 *
 * 职责：
 * - 从 DB 读取 vendor + vendor_model + vendor_api_key
 * - 用最小测试 payload 调用 /v1/chat/completions
 * - 超时控制 15s
 * - 返回标准化连通性结果
 *
 * @module services/connectivity-check
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { vendors } from "../db/schema/vendors";
import { vendorModels } from "../db/schema/vendor-models";
import { vendorApiKeys } from "../db/schema/vendor-api-keys";

/** 连通性测试结果 */
export interface ConnectivityResult {
  ok: boolean;
  latencyMs?: number;
  modelReturned?: string;
  error?: "timeout" | "auth_error" | "model_not_found" | "network_error";
  detail?: string;
}

const TIMEOUT_MS = 15_000;

/**
 * 解密 API Key（从 encryptedKey 字段解密）
 */
export function decryptApiKey(encrypted: string): string | null {
  try {
    const ENC_KEY = crypto
      .createHash("sha256")
      .update(process.env.KEY_ENC_SECRET ?? "3cloud-key-enc-secret")
      .digest();
    const [ivs, tags, encs] = encrypted.split(":");
    if (!ivs || !tags || !encs) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      ENC_KEY,
      Buffer.from(ivs, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tags, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encs, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * 测试某个供应商模型映射的连通性
 *
 * 流程：
 * 1. 根据 vendorModelId 读取 vendor_model
 * 2. 读取关联 vendor（获取 baseUrl）
 * 3. 读取该 vendor 下第一个启用的 API Key
 * 4. 用最小 payload 调用 /v1/chat/completions
 * 5. 返回标准化 ConnectivityResult
 *
 * @param vendorModelId 供应商-模型映射 ID
 * @returns 连通性测试结果
 */
export async function checkModelConnectivity(
  vendorModelId: number,
): Promise<ConnectivityResult> {
  // Step 1: 读取 vendor_model 映射
  const vmRows = await db
    .select()
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vmRows[0]) {
    return { ok: false, error: "network_error", detail: "vendor_model 不存在" };
  }
  const vm = vmRows[0];

  // Step 2: 读取供应商
  const vRows = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, vm.vendorId))
    .limit(1);

  if (!vRows[0]) {
    return { ok: false, error: "network_error", detail: "供应商不存在" };
  }
  const vendor = vRows[0];

  // Step 3: 读取该供应商下第一个启用的 API Key
  const keyRows = await db
    .select()
    .from(vendorApiKeys)
    .where(eq(vendorApiKeys.vendorId, vm.vendorId))
    .limit(1);

  const enabledKey = keyRows.find((k) => k.isEnabled);
  if (!enabledKey) {
    return { ok: false, error: "auth_error", detail: "该供应商无可用 API Key" };
  }

  const rawKey = decryptApiKey(enabledKey.encryptedKey);
  if (!rawKey) {
    return { ok: false, error: "auth_error", detail: "API Key 解密失败" };
  }

  const base = (vendor.baseUrl ?? "").replace(/\/$/, "");
  if (!base) {
    return { ok: false, error: "network_error", detail: "供应商未配置上游地址" };
  }

  // Step 4: 发送最小测试请求
  const testPayload = {
    model: vm.upstreamModel,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const t0 = Date.now();
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "auth_error", latencyMs, detail: `上游返回 ${res.status} Unauthorized` };
      }
      const body = await res.text().catch(() => "");
      if (res.status === 404 || body.includes("model_not_found") || body.includes("not found")) {
        return { ok: false, error: "model_not_found", latencyMs, detail: body.slice(0, 200) };
      }
      return { ok: false, error: "network_error", latencyMs, detail: `上游返回 ${res.status}` };
    }

    // Success
    const data = await res.json().catch(() => ({}));
    const modelReturned =
      (data as any)?.model ??
      (data as any)?.choices?.[0]?.model ??
      vm.upstreamModel;

    return { ok: true, latencyMs, modelReturned };
  } catch (e: any) {
    const latencyMs = Date.now() - (Date.now() - 0); // approximate
    if (e?.name === "AbortError") {
      return { ok: false, error: "timeout", detail: "请求超时 (15s)" };
    }
    return {
      ok: false,
      error: "network_error",
      detail: e?.message ?? "网络请求失败",
    };
  } finally {
    clearTimeout(timer);
  }
}
