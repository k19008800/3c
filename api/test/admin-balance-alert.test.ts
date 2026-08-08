import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * 余额预警管理端测试
 */
let app: FastifyInstance;
let adminToken: string;
let createdRuleId: number;

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@3cloud.io", password: "seed-admin" },
  });
  adminToken = JSON.parse(res.body).token;
});

afterAll(async () => {
  if (createdRuleId) await pool.query("DELETE FROM balance_alert_rules WHERE id=$1", [createdRuleId]);
  await app.close();
  await pool.end();
});

describe("余额预警规则 CRUD", () => {
  it("GET /api/v1/admin/balance-alerts/rules — 规则列表", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/balance-alerts/rules",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toBeDefined();
    expect(body.data.pagination).toBeDefined();
  });

  it("POST /api/v1/admin/balance-alerts/rules — 创建规则", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/balance-alerts/rules",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "全局80%预警", thresholdPercent: 80, channel: "both" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.name).toBe("全局80%预警");
    expect(body.data.thresholdPercent).toBe(80);
    createdRuleId = body.data.id;
  });

  it("POST 缺少必填字段 → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/balance-alerts/rules",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { description: "no name" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/admin/balance-alerts/logs — 预警记录", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/balance-alerts/logs",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toBeDefined();
    expect(body.data.pagination).toBeDefined();
  });

  it("无 token → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/balance-alerts/rules",
    });
    expect(res.statusCode).toBe(401);
  });
});
