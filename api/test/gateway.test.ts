import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { hashApiKey, keyPrefixOf } from "../src/services/api-auth";
import { pool } from "../src/db/index";

/**
 * API 网关 proxy 集成测试
 * 需要本地 PG + Redis 运行（与 dev 相同环境）
 * 测试链路: 建用户/Key/供应商/模型/映射 → 调 /v1/chat/completions（mock 上游）→ 断言计费
 */

let app: FastifyInstance;
let userId: number;
let apiKeyId: number;
let secret = "sk-test-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
let vendorModelId: number;
let modelId: number;

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  // 清理上次可能遗留的测试数据（vendors.name/code 和 models.name 有唯一约束）
  await pool.query("DELETE FROM vendor_models WHERE upstream_model='mock-upstream'").catch(() => {});
  await pool.query("DELETE FROM vendor_api_keys WHERE key_prefix='mockkey'").catch(() => {});
  await pool.query("DELETE FROM vendors WHERE name LIKE 'MockVendor%' OR code LIKE 'mock-%'").catch(() => {});
  await pool.query("DELETE FROM models WHERE name='mock-model'").catch(() => {});

  // 建用户（余额足够）
  const u = await pool.query(
    "INSERT INTO users (email, password_hash, balance, status, role) VALUES ($1,'x',100000,'active','user') RETURNING id",
    [`test-gw-${Date.now()}@x.com`],
  );
  userId = Number(u.rows[0].id);

  // 建 Key
  const kh = hashApiKey(secret);
  const key = await pool.query(
    "INSERT INTO api_keys (user_id, name, key_prefix, key_hash, status) VALUES ($1,$2,$3,$4,'active') RETURNING id",
    [userId, "test", keyPrefixOf(secret), kh],
  );
  apiKeyId = Number(key.rows[0].id);

  // 供应商 + Key
  const v = await pool.query(
    "INSERT INTO vendors (name, code, status, base_url) VALUES ('MockVendor','mock','active','http://mock.local') RETURNING id",
  );
  const vendorId = Number(v.rows[0].id);
  await pool.query(
    "INSERT INTO vendor_api_keys (vendor_id, encrypted_key, key_prefix, is_enabled) VALUES ($1,'mock-key','mockkey','true')",
    [vendorId],
  );

  // 模型 + 映射
  const m = await pool.query(
    "INSERT INTO models (name, display_name, status) VALUES ($1,'Mock Model','active') RETURNING id",
    ["mock-model"],
  );
  modelId = Number(m.rows[0].id);
  const vm = await pool.query(
    "INSERT INTO vendor_models (vendor_id, model_id, upstream_model, cost_input_price, cost_output_price, weight, priority, is_enabled) VALUES ($1,$2,'mock-upstream',0.003,0.015,100,10,'true') RETURNING id",
    [vendorId, modelId],
  );
  vendorModelId = Number(vm.rows[0].id);
});

afterAll(async () => {
  await app.close();
  // 清理测试数据
  await pool.query("DELETE FROM vendor_models WHERE id=$1", [vendorModelId]).catch(() => {});
  await pool.query("DELETE FROM api_keys WHERE id=$1", [apiKeyId]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => {});
  await pool.end();
});

describe("API 网关 proxy（chat/completions）", () => {
  it("用有效 Key 调用，应返回上游结果并正确计费", async () => {
    // mock 上游返回 OpenAI 格式
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: "cmpl-mock",
        object: "chat.completion",
        model: "mock-model",
        choices: [{ index: 0, message: { role: "assistant", content: "hello" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    }) as any;

    try {
      const res = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${secret}` },
        payload: { model: "mock-model", messages: [{ role: "user", content: "hi" }] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.choices[0].message.content).toBe("hello");
      // 计费元数据
      expect(body._meta).toBeDefined();
      expect(body._meta.provider).toBe("MockVendor");
      // 上游原始 usage 透传
      expect(body.usage.total_tokens).toBe(30);
      // 计费信息在 _meta
      expect(body._meta.usage.totalTokens).toBe(30);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("无效 Key 应返回 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-invalid" },
      payload: { model: "mock-model", messages: [] },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("KEY_INVALID");
  });

  it("缺少 Authorization 应返回 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "mock-model", messages: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("上游失败应返回 502 并退还预扣", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: "upstream down" } }),
    }) as any;

    try {
      // 记录调用前余额
      const before = (await pool.query("SELECT balance FROM users WHERE id=$1", [userId])).rows[0].balance;
      const res = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${secret}` },
        payload: { model: "mock-model", messages: [{ role: "user", content: "hi" }], max_tokens: 50 },
      });
      expect(res.statusCode).toBe(502);
      // 失败退还预扣 → 余额应不变
      const after = (await pool.query("SELECT balance FROM users WHERE id=$1", [userId])).rows[0].balance;
      expect(Number(after)).toBe(Number(before));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("GET /v1/models 返回模型列表", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/models" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe("list");
    expect(body.data.some((m: any) => m.id === "mock-model")).toBe(true);
  });
});
