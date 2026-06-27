// ============================================================
//  3cloud (3C) — 健康检查路由
//  GET /health   — 应用存活
//  GET /ready    — 就绪（DB + Redis 连通性）
// ============================================================

import { FastifyInstance } from "fastify";
import { checkDbConnection } from "../db/index.js";
import { getRedis } from "../redis.js";

export async function healthRoutes(app: FastifyInstance) {
  // 应用存活检查
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // 就绪检查（DB + Redis）
  app.get("/ready", async (request, reply) => {
    const checks: Record<string, boolean | string> = {};

    try {
      checks.database = await checkDbConnection();
    } catch (err: any) {
      checks.database = `error: ${err.message}`;
    }

    try {
      const redis = getRedis();
      checks.redis = await redis.ping().then(() => true).catch((err: Error) => `error: ${err.message}`);
    } catch (err: any) {
      checks.redis = `error: ${err.message}`;
    }

    const allHealthy = Object.values(checks).every((v) => v === true);

    if (!allHealthy) {
      reply.code(503);
    }

    return {
      status: allHealthy ? "ready" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    };
  });
}
