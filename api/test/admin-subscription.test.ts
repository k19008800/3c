import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * 订阅管理端测试
 */
let app: FastifyInstance;
let adminToken: string;
let createdPlanId: number;

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
  if (createdPlanId) await pool.query("DELETE FROM subscription_plans WHERE id=$1", [createdPlanId]);
  await app.close();
  await pool.end();
});

describe("订阅计划管理", () => {
  it("GET /api/v1/admin/subscriptions/plans — 计划列表", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toBeDefined();
    expect(body.data.pagination).toBeDefined();
  });

  it("POST /api/v1/admin/subscriptions/plans — 创建计划", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "专业版",
        description: "适合开发者的专业版",
        price: 29.9,
        billingCycle: "monthly",
        modelLimit: 50,
        requestLimit: 10000,
        features: { priority_support: true },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.name).toBe("专业版");
    expect(body.data.price).toBe(29.9);
    createdPlanId = body.data.id;
  });

  it("PUT /api/v1/admin/subscriptions/plans/:id — 更新计划", async () => {
    if (!createdPlanId) return;
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/subscriptions/plans/${createdPlanId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "专业版(更新)", price: 39.9, status: "inactive" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe("专业版(更新)");
    expect(body.data.price).toBe(39.9);
    expect(body.data.status).toBe("inactive");
  });

  it("PUT 更新不存在的计划 → 404", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/subscriptions/plans/999999",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "不存在的" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("创建缺少 name → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { price: 10 },
    });
    expect(res.statusCode).toBe(400);
  });
});
