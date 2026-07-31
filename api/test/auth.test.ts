import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * 认证路由测试（§2）
 * 依赖 seed：admin 用户 (admin@3cloud.io, 密码明文 'seed-admin')
 */
let app: FastifyInstance;
let token: string;
let testUserId: number;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("认证（auth）", () => {
  it("注册新用户", async () => {
    const email = `test-auth-${Date.now()}@x.com`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "secret123", username: "tester" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe(email);
    testUserId = body.user.id;
  });

  it("重复注册同一邮箱 → 409", async () => {
    const email = `dup-${Date.now()}@x.com`;
    const payload = { email, password: "secret123", username: "dup" };
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload });
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload });
    expect(res.statusCode).toBe(409);
  });

  it("seed admin 登录（明文密码兼容）", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@3cloud.io", password: "seed-admin" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe("admin@3cloud.io");
    token = body.token;
  });

  it("错误密码 → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@3cloud.io", password: "wrongpass" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /me 带 token 返回用户信息", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe("admin@3cloud.io");
  });

  it("GET /me 无 token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    expect(res.statusCode).toBe(401);
  });

  it("清理：删除测试注册用户", async () => {
    if (testUserId) await pool.query("DELETE FROM users WHERE id=$1", [testUserId]);
  });
});
