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
  ["select", "from", "where", "limit", "orderBy", "offset", "returning", "insert", "values", "update", "set", "delete", "innerJoin", "leftJoin", "groupBy"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  return {
    db: chain,
    pool: { query: mockPoolQuery, connect: vi.fn(), end: vi.fn() },
  };
});

// ── Import routes after mock ──
import { notificationRoutes } from "../src/routes/notification";

async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-notif" });
  await a.register(notificationRoutes, { prefix: "/api/v1" });
  await a.ready();
  return a;
}

let app: any;
let token: string;

function signToken(payload: any) {
  return app.jwt.sign(payload);
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildTestApp();
  token = signToken({ sub: "42", email: "test@example.com" });
});

describe("通知订阅偏好", () => {
  it("GET /me/notification-subscriptions 返回默认全开启", async () => {
    mockDbResult.mockReturnValue([]); // 无已有订阅记录
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/notification-subscriptions",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.prefs).toBeDefined();
  });

  it("POST /me/notification-subscriptions/:type/:channel 更新偏好", async () => {
    mockDbResult.mockReturnValue([]); // 无已有记录
    // insert returning id
    mockDbResult.mockReturnValue([{ id: 1 }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/notification-subscriptions/quota_exhaustion/site",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
  });

  it("更新偏好时无效类型返回 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/notification-subscriptions/invalid_type/site",
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("通知消息", () => {
  it("GET /notifications 返回通知列表", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, user_id: 42, title: "测试通知", content: "内容", category: "system", is_read: false, read_at: null, created_at: new Date().toISOString() },
      ],
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ c: 1 }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ c: 1 }] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toHaveLength(1);
    expect(body.data.unread_count).toBe(1);
  });

  it("GET /notifications?is_read=true 筛选已读", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ c: 0 }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ c: 0 }] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?is_read=true",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
  });

  it("PUT /notifications/:id/read 标记已读", async () => {
    // mock for update (rowCount)
    const updateMock = { rowCount: 1 };
    mockDbResult.mockReturnValue(updateMock);
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/1/read",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
  });

  it("PUT /notifications/:id/read 通知不存在", async () => {
    const updateMock = { rowCount: 0 };
    mockDbResult.mockReturnValue(updateMock);
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/999/read",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /notifications/read-all 全部已读", async () => {
    const updateMock = { rowCount: 5 };
    mockDbResult.mockReturnValue(updateMock);
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/read-all",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("无 token 返回 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/notifications" });
    expect(res.statusCode).toBe(401);
  });
});
