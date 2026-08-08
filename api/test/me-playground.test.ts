import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
import { pool } from "../src/db/index";

/**
 * Playground / API 调试端点测试
 */
let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@3cloud.io", password: "seed-admin" },
  });
  token = JSON.parse(res.body).token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("Playground 调试端点", () => {
  it("POST /api/v1/me/playground/chat — 缺少 model → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/playground/chat",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { messages: [{ role: "user", content: "hello" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/me/playground/chat — 不存在的模型 → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/playground/chat",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { model: "nonexistent-model", messages: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/me/playground/chat — 无 token → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/playground/chat",
      headers: { "content-type": "application/json" },
      payload: { model: "gpt-4", messages: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});
