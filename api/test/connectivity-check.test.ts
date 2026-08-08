/**
 * 模型连通性测试 — 单元测试
 *
 * 覆盖 9 个测试用例：
 * 1. 连通成功 → ok:true + latencyMs + modelReturned
 * 2. 认证失败 → ok:false + error:"auth_error" (401/403)
 * 3. 模型不存在 → ok:false + error:"model_not_found" (404)
 * 4. 请求超时 → ok:false + error:"timeout" (15s AbortSignal)
 * 5. 网络错误 → ok:false + error:"network_error"
 * 6. vendor_model 不存在 → ok:false + error:"network_error"
 * 7. 无可用 API Key → ok:false + error:"auth_error"
 * 8. 上游返回 500 → ok:false + error:"network_error"
 * 9. API Key 解密失败 → ok:false + error:"auth_error"
 *
 * @see development-plan.md §3
 * @module test/connectivity-check
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";

// ── Pre-compute an encrypted API key that the real decryptApiKey can handle ──

const ENC_KEY = crypto.createHash("sha256").update("3cloud-key-enc-secret").digest();

function realEncrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

const TEST_PLAIN_KEY = "test-api-key-12345";
const TEST_ENCRYPTED_KEY = realEncrypt(TEST_PLAIN_KEY);

// ── Hoisted DB mock state ──

const { dbSelectQueue } = vi.hoisted(() => {
  const dbSelectQueue: any[] = [];
  return { dbSelectQueue };
});

function resetDbMocks(): void {
  dbSelectQueue.length = 0;
}

function pushSelectResult(data: any): void {
  dbSelectQueue.push(data);
}

function createChainable(dataFactory: () => any) {
  const chain: Record<string, any> = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
  };
  Object.defineProperty(chain, "then", {
    value: (resolve: Function) => Promise.resolve(resolve(dataFactory())),
  });
  return chain;
}

vi.mock("../src/db/index", () => ({
  db: {
    select: () => createChainable(() => dbSelectQueue.shift() ?? []),
    insert: () => createChainable(() => []),
    update: () => createChainable(() => ({ rowCount: 1 })),
    delete: () => createChainable(() => ({ rowCount: 1 })),
  },
  pool: {
    query: async () => ({ rows: [] }),
  },
}));

// ── Mock global fetch ──

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// ── Import after mocks ──

import { checkModelConnectivity } from "../src/services/connectivity-check";

beforeEach(() => {
  resetDbMocks();
  mockFetch.mockReset();
});

/**
 * Helper: seed DB with valid test data
 */
function seedDbForTest(overrides?: {
  vendorModel?: any;
  vendor?: any;
  apiKeys?: any[];
}): void {
  pushSelectResult(overrides?.vendorModel ?? [
    { id: 1, vendorId: 10, modelId: 100, upstreamModel: "gpt-4o", isEnabled: true },
  ]);
  pushSelectResult(overrides?.vendor ?? [
    { id: 10, name: "TestAI", baseUrl: "https://api.test.ai", apiFormat: "openai" },
  ]);
  pushSelectResult(overrides?.apiKeys ?? [
    { id: 1, vendorId: 10, encryptedKey: TEST_ENCRYPTED_KEY, keyPrefix: "sk-test...", isEnabled: true },
  ]);
}

describe("连通性测试 — checkModelConnectivity", () => {
  // ─── Test 1: 连通成功 ───

  it("连通成功 → ok:true + latencyMs + modelReturned", async () => {
    seedDbForTest();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ model: "gpt-4o", choices: [{ message: { content: "pong" } }] }),
      text: async () => JSON.stringify({ model: "gpt-4o" }),
    });

    const result = await checkModelConnectivity(1);

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.modelReturned).toBe("gpt-4o");
    expect(result.error).toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];
    expect(fetchArgs[0]).toBe("https://api.test.ai/v1/chat/completions");
    expect(fetchArgs[1].method).toBe("POST");
    expect(fetchArgs[1].headers.Authorization).toBe(`Bearer ${TEST_PLAIN_KEY}`);
    const payload = JSON.parse(fetchArgs[1].body);
    expect(payload.model).toBe("gpt-4o");
    expect(payload.messages[0].content).toBe("ping");
    expect(payload.max_tokens).toBe(1);
    expect(payload.stream).toBe(false);
  });

  // ─── Test 2: 认证失败 ───

  it("认证失败 → ok:false + error:auth_error (401)", async () => {
    seedDbForTest();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: "Invalid API key" } }),
    });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("auth_error");
    expect(result.detail).toContain("401");
  });

  it("认证失败 → 403 同样返回 auth_error", async () => {
    seedDbForTest();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("auth_error");
  });

  // ─── Test 3: 模型不存在 ───

  it("模型不存在 → ok:false + error:model_not_found (404)", async () => {
    seedDbForTest({ vendorModel: [{ id: 1, vendorId: 10, modelId: 100, upstreamModel: "nonexistent", isEnabled: true }] });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: { message: "model_not_found" } }),
    });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("model_not_found");
  });

  // ─── Test 4: 请求超时 ───

  it("请求超时 → ok:false + error:timeout", async () => {
    seedDbForTest();

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("timeout");
    expect(result.detail).toContain("超时");
  });

  // ─── Test 5: 网络错误 ───

  it("网络错误 → ok:false + error:network_error", async () => {
    seedDbForTest();

    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network_error");
    expect(result.detail).toContain("ECONNREFUSED");
  });

  // ─── Test 6: vendor_model 不存在 ───

  it("vendor_model 不存在 → ok:false + error:network_error", async () => {
    pushSelectResult([]);

    const result = await checkModelConnectivity(999);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network_error");
    expect(result.detail).toContain("不存在");
  });

  // ─── Test 7: 无 API Key ───

  it("无可用 API Key → ok:false + error:auth_error", async () => {
    seedDbForTest({ apiKeys: [] });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("auth_error");
    expect(result.detail).toContain("无可用");
  });

  // ─── Test 8: 上游返回 500 → network_error ───

  it("上游返回 500 → ok:false + error:network_error", async () => {
    seedDbForTest();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network_error");
    expect(result.detail).toContain("500");
  });

  // ─── Test 9: API Key 解密失败 → auth_error ───

  it("API Key 解密失败 → ok:false + error:auth_error", async () => {
    seedDbForTest({ apiKeys: [{ id: 1, vendorId: 10, encryptedKey: "bad:data", keyPrefix: "sk-bad...", isEnabled: true }] });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("auth_error");
    expect(result.detail).toContain("解密失败");
  });

  // ─── Test 10: 供应商无 baseUrl → network_error ───

  it("供应商无 baseUrl → ok:false + error:network_error", async () => {
    seedDbForTest({ vendor: [{ id: 10, name: "NoBaseAI", baseUrl: "", apiFormat: "openai" }] });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network_error");
    expect(result.detail).toContain("未配置上游地址");
  });

  // ─── Test 11: 供应商不存在 → network_error ───

  it("供应商不存在 → ok:false + error:network_error", async () => {
    pushSelectResult([{ id: 1, vendorId: 10, modelId: 100, upstreamModel: "gpt-4o", isEnabled: true }]);
    pushSelectResult([]); // vendor not found

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network_error");
    expect(result.detail).toContain("供应商不存在");
  });

  // ─── Test 12: 上游返回非 401/403/404 错误 → network_error ───

  it("上游返回 429 → ok:false + error:network_error（非 auth/model 错误）", async () => {
    seedDbForTest();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Too Many Requests",
    });

    const result = await checkModelConnectivity(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network_error");
    expect(result.detail).toContain("429");
  });
});
