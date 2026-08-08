import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * 管理端安全 + 风控 + 预算测试（§20）
 */
let app: FastifyInstance;
let adminToken: string;
let createdRuleId: number;
let createdEventId: number;

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  // 获取 admin token
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@3cloud.io", password: "seed-admin" },
  });
  const body = JSON.parse(res.body);
  adminToken = body.token;

  // 预埋安全事件用于测试
  const er = await pool.query(
    `INSERT INTO security_events (type, severity, user_id, detail, ip, status)
     VALUES ('login_fail', 'low', NULL, '{"attempts":3}', '192.168.1.1', 'pending') RETURNING id`,
  );
  createdEventId = er.rows[0]?.id;
});

afterAll(async () => {
  // 清理测试数据
  if (createdRuleId) await pool.query("DELETE FROM risk_rules WHERE id=$1", [createdRuleId]);
  if (createdEventId) await pool.query("DELETE FROM security_events WHERE id=$1", [createdEventId]);
  await app.close();
  await pool.end();
});

describe("风控规则管理", () => {
  it("GET /api/v1/admin/security/rules — 列表", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security/rules",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toBeDefined();
    expect(body.data.pagination).toBeDefined();
  });

  it("POST /api/v1/admin/security/rules — 创建", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/security/rules",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "测试IP风控",
        type: "ip",
        action: "block",
        conditions: { max_requests: 100, window_seconds: 60 },
        priority: 10,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.name).toBe("测试IP风控");
    createdRuleId = body.data.id;
  });

  it("PUT /api/v1/admin/security/rules/:id — 更新", async () => {
    if (!createdRuleId) return;
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/security/rules/${createdRuleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "更新后的IP风控", enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe("更新后的IP风控");
    expect(body.data.enabled).toBe(false);
  });

  it("DELETE /api/v1/admin/security/rules/:id — 删除", async () => {
    if (!createdRuleId) return;
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/security/rules/${createdRuleId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.success).toBe(true);
    createdRuleId = 0;
  });

  it("缺少字段创建 → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/security/rules",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { description: "no name" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("无 token 访问 → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security/rules",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("安全事件管理", () => {
  it("GET /api/v1/admin/security/events — 安全事件列表", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security/events",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toBeDefined();
  });

  it("POST /api/v1/admin/security/events/:id/handle — 处理事件", async () => {
    if (!createdEventId) return;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/security/events/${createdEventId}/handle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "resolved", resolution: "误报，已忽略" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe("resolved");
  });

  it("处理不存在的事件 → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/security/events/999999/handle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "resolved" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("用户预算管理", () => {
  it("GET /api/v1/admin/budgets — 预算列表", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/budgets",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).code).toBe(0);
  });
});
