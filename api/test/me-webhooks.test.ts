import { vi, describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

// ── Hoisted mock state ──
const { mockDbResult, mockPoolQuery } = vi.hoisted(() => ({
  mockDbResult: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

// ── Mock db ──
vi.mock("../src/db/index", () => {
  const chain: any = {
    then(resolve: any) {
      return resolve(mockDbResult());
    },
    catch(reject: any) {
      return reject(undefined);
    },
  };
  ["select", "from", "where", "limit", "orderBy", "offset", "returning", "insert", "values", "update", "set", "delete"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  return {
    db: chain,
    pool: { query: mockPoolQuery, connect: vi.fn(), end: vi.fn() },
  };
});

// ── Import routes after mock ──
import { meWebhooksRoutes } from "../src/routes/me-webhooks";

async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-wh" });
  await a.register(meWebhooksRoutes, { prefix: "/api/v1" });
  await a.ready();
  return a;
}

let app: any;
let token: string;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildTestApp();
  token = app.jwt.sign({ sub: "42", email: "test@example.com" });
});

describe("Webhook 用户端", () => {
  const mockWebhook = {
    id: 1,
    name: "测试 Webhook",
    url: "https://example.com/hook",
    events: JSON.stringify(["user.created", "recharge.completed"]),
    secret: "test-secret-abc",
    is_active: true,
    retry_count: 3,
    timeout_ms: 5000,
    last_triggered_at: null,
    last_success_at: null,
    last_error: null,
    created_by: 42,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("GET /me/webhooks 返回 Webhook 列表", async () => {
    mockDbResult.mockReturnValue([mockWebhook]);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/webhooks",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toHaveLength(1);
    expect(body.data.list[0].has_secret).toBe(true);
  });

  it("POST /me/webhooks 创建 Webhook", async () => {
    mockDbResult.mockReturnValue([{ id: 1 }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "My Webhook",
        url: "https://example.com/hook",
        events: ["user.created", "recharge.completed"],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(1);
    expect(body.data.secret).toBeDefined();
  });

  it("POST /me/webhooks 缺少名称", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: "https://example.com/hook", events: ["user.created"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /me/webhooks 无效事件", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "test", url: "https://example.com/hook", events: ["invalid.event"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /me/webhooks 无效 URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "test", url: "not-a-url", events: ["user.created"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /me/webhooks/:id 更新 Webhook", async () => {
    mockDbResult.mockReturnValueOnce([mockWebhook]); // select existing
    mockDbResult.mockReturnValueOnce({ rowCount: 1 }); // update
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/me/webhooks/1",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Updated", is_active: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
  });

  it("PUT /me/webhooks/:id Webhook 不存在", async () => {
    mockDbResult.mockReturnValue([]);
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/me/webhooks/999",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "test" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /me/webhooks/:id 删除 Webhook", async () => {
    mockDbResult.mockReturnValue({ rowCount: 1 });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/me/webhooks/1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /me/webhooks/:id Webhook 不存在", async () => {
    mockDbResult.mockReturnValue({ rowCount: 0 });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/me/webhooks/999",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /me/webhooks/:id/test 测试发送", async () => {
    mockDbResult.mockReturnValueOnce([mockWebhook]); // select webhook
    mockDbResult.mockReturnValueOnce([]);             // insert delivery log
    mockDbResult.mockReturnValueOnce({ rowCount: 1 }); // update webhook

    // Mock fetch to return success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/webhooks/1/test",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.status).toBe("success");
  });

  it("无 token 返回 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/webhooks" });
    expect(res.statusCode).toBe(401);
  });
});
