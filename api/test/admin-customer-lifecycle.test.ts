import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * 客户生命周期管理端测试
 */
let app: FastifyInstance;
let adminToken: string;

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
  await app.close();
  await pool.end();
});

describe("客户生命周期统计", () => {
  it("GET /api/v1/admin/customers/lifecycle — 阶段分布", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/customers/lifecycle",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.stages).toBeDefined();
    expect(Array.isArray(body.data.stages)).toBe(true);
    expect(body.data.total).toBeDefined();
    // 验证阶段名称
    const stageNames = body.data.stages.map((s: any) => s.stage);
    expect(stageNames).toContain("new");
    expect(stageNames).toContain("active");
    expect(stageNames).toContain("at_risk");
    expect(stageNames).toContain("dormant");
    expect(stageNames).toContain("churned");
  });

  it("GET /api/v1/admin/customers/lifecycle/funnel — 转化漏斗", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/customers/lifecycle/funnel",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.funnel).toBeDefined();
    expect(Array.isArray(body.data.funnel)).toBe(true);
    // 验证漏斗阶段名称
    const funnelNames = body.data.funnel.map((s: any) => s.stage);
    expect(funnelNames).toContain("registered");
    expect(funnelNames).toContain("first_call");
    expect(funnelNames).toContain("first_recharge");
    expect(funnelNames).toContain("second_recharge");
    expect(funnelNames).toContain("active_user");
  });

  it("无 token → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/customers/lifecycle",
    });
    expect(res.statusCode).toBe(401);
  });
});
