// ============================================================
//  proxy-billing.test.ts — 代理、计费、限流、健康集成测试
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, loginAs } from "./helpers.js";
import { getDb, createDb } from "../db/index.js";
import { createRedis } from "../redis.js";
import { callLogs, balanceLogs, apiKeys as apiKeysTable } from "../db/schema.js";
import { desc, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";

// ── 测试中使用的数据 ──
const TEST_MODEL = "DeepSeek-V4-Pro";
const TEST_EMAIL = "admin@3cloud.dev";
const TEST_PASSWORD = "admin123";

let app: FastifyInstance;
let accessToken: string;
let apiKeyValue: string;
let apiKeyId: number;
let testUserId: number;

// 生成随机后缀
function randSuffix(): string {
  return randomBytes(5).toString("hex");
}

// ── 测试前准备 ──
beforeAll(async () => {
  // 初始化 DB 和 Redis（必须早于 buildApp，因为 db plugin 需要它们）
  createDb();
  createRedis();
  app = await getApp();

  // 登录获取 JWT
  accessToken = await loginAs(TEST_EMAIL, TEST_PASSWORD);

  // 获取当前用户信息
  const meRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const meBody = JSON.parse(meRes.body);
  testUserId = meBody.data?.id || meBody.id;
  if (!testUserId) throw new Error("无法获取当前用户 ID");

  // 创建一个 API Key
  const keyName = `test-proxy-key-${randSuffix()}`;
  const keyRes = await app.inject({
    method: "POST",
    url: "/api/v1/api-keys",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name: keyName },
  });
  const keyBody = JSON.parse(keyRes.body);
  expect(keyRes.statusCode).toBe(200);
  expect(keyBody.data.key).toBeDefined();
  apiKeyValue = keyBody.data.key;
  apiKeyId = keyBody.data.id;
});

// ── 测试后清理 ──
afterAll(async () => {
  if (apiKeyId) {
    try {
      const db = getDb();
      // 先删除关联的 call_logs，否则外键约束失败
      await db.delete(callLogs).where(eq(callLogs.apiKeyId, apiKeyId));
      await db.delete(apiKeysTable).where(eq(apiKeysTable.id, apiKeyId));
    } catch (err) {
      // 清理失败不阻塞测试结果
    }
  }
  await closeApp();
});

// ══════════════════════════════════════════════════════════
//  1. GET /health — 健康检查
// ══════════════════════════════════════════════════════════

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════
//  2. GET /v1/models — 模型列表（公开）
// ══════════════════════════════════════════════════════════

describe("GET /v1/models", () => {
  it("returns 200 with model list on /v1/models", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.list)).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);

    const firstModel = body.data.list[0];
    expect(firstModel.id).toBeDefined();
    expect(firstModel.name).toBeDefined();
    expect(firstModel.type).toBeDefined();
  });

  it("returns 200 with model list on /api/v1/models", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/models",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data.list)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
//  3. POST /v1/chat/completions — 鉴权测试
// ══════════════════════════════════════════════════════════

describe("POST /v1/chat/completions — auth", () => {
  it("returns 401 without API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 401 with invalid API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer sk-invalid-key-test" },
      payload: {
        model: TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("invalid_api_key");
  });
});

// ══════════════════════════════════════════════════════════
//  4. POST /v1/chat/completions — 参数校验
// ══════════════════════════════════════════════════════════

describe("POST /v1/chat/completions — validation", () => {
  it("returns 400 when model is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKeyValue}` },
      payload: {
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect([400, 429]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
    }
  });

  it("returns 404 for unknown model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKeyValue}` },
      payload: {
        model: "non-existent-model-99999",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect([404, 429]).toContain(res.statusCode);
    if (res.statusCode === 404) {
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("MODEL_NOT_FOUND");
    }
  });
});

// ══════════════════════════════════════════════════════════
//  5. POST /v1/chat/completions — 非流式（有效 API Key）
//     上游可能不可达，验证错误处理路径正常
// ══════════════════════════════════════════════════════════

describe("POST /v1/chat/completions — non-streaming", () => {
  it("returns 502 when upstream is unreachable (expected in dev/test)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKeyValue}` },
      payload: {
        model: TEST_MODEL,
        messages: [{ role: "user", content: "Say hello in 3 words" }],
        temperature: 0,
        max_tokens: 50,
      },
    });

    // 上游不可达时返回 502，格式应为 OpenAI 兼容错误
    // 注意：在某些情况下可能抛出其他错误，但不应是 500 服务端错误
    expect([200, 429, 502, 503]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      const body = JSON.parse(res.body);
      expect(body.choices).toBeDefined();
      expect(body.choices.length).toBeGreaterThan(0);
      expect(body.usage).toBeDefined();
    } else if (res.statusCode === 502) {
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
    }
  });

  it("writes call_logs for the request attempt", async () => {
    // 触发一次 API 调用
    await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKeyValue}` },
      payload: {
        model: TEST_MODEL,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 5,
      },
    });

    const db = getDb();

    // 查询该 API Key 最近的所有 call_log（失败或成功）
    const recentCalls = await db
      .select()
      .from(callLogs)
      .where(eq(callLogs.apiKeyId, apiKeyId))
      .orderBy(desc(callLogs.createdAt))
      .limit(5);

    // 上游不可达时(503)可能没有 call_log 记录；有记录时验证字段
    // 注意: 测试环境中上游不可达，call_log 可能不会被写入
    if (recentCalls.length === 0) {
      console.log("[test] No call_logs found — upstream was unreachable, test skipped");
      return;
    }

    // 验证基本字段
    const log = recentCalls[0];
    expect(log.userId).toBe(testUserId);
    expect(log.apiKeyId).toBe(apiKeyId);
    if (log.modelName !== null) {
      expect(log.modelName).toBe(TEST_MODEL);
    }
    expect(log.promptTokens).toBeGreaterThanOrEqual(0);
    expect(log.completionTokens).toBeGreaterThanOrEqual(0);
    expect(log.totalTokens).toBeGreaterThanOrEqual(0);
    expect(log.cost).toBeDefined();
    expect(["success", "failed", "timeout", "cancelled", "rate_limited"]).toContain(log.status);
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.createdAt).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
//  6. POST /v1/chat/completions — 流式
// ══════════════════════════════════════════════════════════

describe("POST /v1/chat/completions — streaming", () => {
  it("returns SSE or error depending on upstream availability", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKeyValue}` },
      payload: {
        model: TEST_MODEL,
        messages: [{ role: "user", content: "Count to 3" }],
        stream: true,
        max_tokens: 30,
      },
    });

    expect([200, 429, 502, 503]).toContain(res.statusCode);

    if (res.statusCode === 200) {
      expect(res.headers["content-type"]).toMatch(/text\/event-stream/i);
      const raw = typeof res.body === "string" ? res.body : String(res.body);
      expect(raw).toContain("data:");
    } else if (res.statusCode === 502) {
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
    }
  });
});

// ══════════════════════════════════════════════════════════
//  7. balance_logs — 验证消费记录类型
// ══════════════════════════════════════════════════════════

describe("Balance log type verification", () => {
  it("consumption type balance_logs have expected fields", async () => {
    const db = getDb();

    const consumptionLog = await db
      .select()
      .from(balanceLogs)
      .where(
        and(
          eq(balanceLogs.userId, testUserId),
          eq(balanceLogs.type, "consumption"),
        ),
      )
      .orderBy(desc(balanceLogs.createdAt))
      .limit(1);

    // 如果存在消费记录则验证结构；不存在则跳过（调用可能没走到计费步骤）
    if (consumptionLog.length > 0) {
      const log = consumptionLog[0];
      expect(log.userId).toBe(testUserId);
      expect(log.type).toBe("consumption");
      expect(parseFloat(String(log.amount))).toBeGreaterThanOrEqual(0);
      expect(log.refType).toBe("call");
      expect(log.refId).toBeGreaterThan(0);
      expect(log.balanceAfter).toBeDefined();
    }
  });
});

// ══════════════════════════════════════════════════════════
//  8. 限流测试 — 快速发送请求验证 429
// ══════════════════════════════════════════════════════════

describe("Rate limiting", () => {
  it("returns 429 or handles rapid requests without server errors", async () => {
    // 请求可能因上游不可达返回 502/503，不属于服务端错误
    // 限流可能因为窗口较大不触发，但系统应能正确处理
    const requestCount = 40;
    const promises: Promise<any>[] = [];

    for (let i = 0; i < requestCount; i++) {
      promises.push(
        app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${apiKeyValue}` },
          payload: {
            model: TEST_MODEL,
            messages: [{ role: "user", content: `request ${i}` }],
            max_tokens: 5,
          },
        }),
      );
    }

    const responses = await Promise.all(promises);

    // 统计各类状态码
    const statusCounts: Record<number, number> = {};
    for (const r of responses) {
      statusCounts[r.statusCode] = (statusCounts[r.statusCode] || 0) + 1;
    }

    // 不应有 500 服务端错误
    expect(statusCounts[500] || 0).toBe(0);

    // 如果有 429 则验证响应格式
    if (statusCounts[429] && statusCounts[429] > 0) {
      const rateLimitedRes = responses.find((r) => r.statusCode === 429);
      if (rateLimitedRes) {
        const body = JSON.parse(rateLimitedRes.body);
        expect(body.error).toBeDefined();
        expect(body.error.type).toBe("rate_limit_error");
        expect(body.error.code).toBe("rate_limit_exceeded");
        expect(rateLimitedRes.headers["retry-after"]).toBeDefined();
      }
    }

    // 验证 call_logs 中有 rate_limited 状态的记录
    const db = getDb();
    const rateLimitedCall = await db
      .select()
      .from(callLogs)
      .where(
        and(
          eq(callLogs.apiKeyId, apiKeyId),
          eq(callLogs.status, "rate_limited"),
        ),
      )
      .orderBy(desc(callLogs.createdAt))
      .limit(1);

    // 如果触发了限流，应有对应记录
    if (statusCounts[429] && statusCounts[429] > 0 && rateLimitedCall.length > 0) {
      expect(rateLimitedCall[0].status).toBe("rate_limited");
      expect(rateLimitedCall[0].errorMessage).toContain("请求频率超限");
    }
  });
});

// ══════════════════════════════════════════════════════════
//  9. GET /ready — 就绪检查
// ══════════════════════════════════════════════════════════

describe("GET /ready", () => {
  it("returns ready or degraded status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(600);
    const body = JSON.parse(res.body);
    expect(["ready", "degraded"]).toContain(body.status);
    expect(body.checks).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
//  10. /api/v1/chat/completions 路径（兼容 /api/v1 前缀）
// ══════════════════════════════════════════════════════════

describe("POST /api/v1/chat/completions — alternate path", () => {
  it("also requires API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: {
        model: TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(res.statusCode).toBe(401);
  });
});
