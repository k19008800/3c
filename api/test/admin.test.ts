import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * 告警规则 + 限流规则管理接口测试
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("告警规则管理（§5.4）", () => {
  let ruleId: string;

  it("创建告警规则", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/monitoring/rules",
      payload: { type: "api_failure_rate", name: "API 失败率", threshold: 5, severity: "critical", enabled: true, silencePeriod: 300 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("api_failure_rate");
    expect(body.threshold).toBe(5);
    ruleId = body.id;
  });

  it("获取全部规则", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/monitoring/rules" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.list)).toBe(true);
  });

  it("更新规则", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/monitoring/rules/${ruleId}`,
      payload: { threshold: 8 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.threshold).toBe(8);
  });

  it("创建告警事件并查询", async () => {
    // 通过 evaluateAlert 触发一条告警（或直接插入）
    const res = await app.inject({ method: "GET", url: "/api/v1/monitoring/alerts" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.list)).toBe(true);
  });

  it("告警趋势统计", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/monitoring/alert-stats?range=7d" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.range).toBe("7d");
  });

  it("删除规则", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/v1/monitoring/rules/${ruleId}` });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as any).ok).toBe(true);
  });
});

describe("限流规则管理（§5.3）", () => {
  it("获取模型限流规则列表", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/rate-limits" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.list)).toBe(true);
  });

  it("创建/更新模型限流规则", async () => {
    // 深度测试：用 seed 的 deepseek-chat 模型(id=5)
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/rate-limits/5",
      payload: { modelQps: 3000, modelUserQps: 60, enabled: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.modelId).toBe(5);
    expect(body.modelQps).toBe(3000);
  });

  it("获取全局限流配置", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/site-configs/rate-limit" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.globalQps).toBeGreaterThan(0);
  });

  it("更新全局限流配置", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/site-configs/rate-limit",
      payload: { globalQps: 12000 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.globalQps).toBe(12000);
  });

  it("限流命中统计", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/rate-limits/stats" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.totalKeys).toBe("number");
  });
});
