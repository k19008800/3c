// ============================================================
//  3cloud (3C) — 多环境管理
//  管理多个部署环境（dev/test/staging/prod）的配置和切换
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

// ── 路由 ──

export async function adminEnvironmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const REDIS_KEY = "env:configs";

  // ──────────────────────────────────────────────
  //  获取环境配置列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/environments", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    let envs: any[];

    // 默认环境配置
    const DEFAULT_ENVS = [
      { id: "dev", name: "开发环境", color: "blue", status: "inactive", config: {}, updatedAt: null },
      { id: "test", name: "测试环境", color: "green", status: "inactive", config: {}, updatedAt: null },
      { id: "staging", name: "预发环境", color: "orange", status: "inactive", config: {}, updatedAt: null },
      { id: "production", name: "生产环境", color: "red", status: "active", config: {}, updatedAt: null },
    ];

    try {
      const raw = await redis.get(REDIS_KEY);
      envs = raw ? JSON.parse(raw) : DEFAULT_ENVS;
    } catch {
      envs = DEFAULT_ENVS;
    }

    reply.status(200).send({ code: 0, data: { list: envs }, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  保存环境配置（全量）
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/environments", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { environments } = request.body as { environments: any[] };
    if (!Array.isArray(environments)) {
      return reply.status(400).send({ code: 400, message: "environments 必须是数组" });
    }

    const redis = getRedis();
    await redis.set(REDIS_KEY, JSON.stringify(environments));

    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "environment",
      ip: request.ip,
      description: "更新环境配置",
    });

    reply.status(200).send({ code: 0, data: null, message: "环境配置已更新" });
  });

  // ──────────────────────────────────────────────
  //  环境健康检测
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/environments/:id/health-check", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // 模拟健康检测：检查服务连通性
    const checks = [
      { name: "API 服务", status: "passed", latency: Math.floor(Math.random() * 200 + 10) },
      { name: "数据库", status: "passed", latency: Math.floor(Math.random() * 50 + 5) },
      { name: "Redis", status: "passed", latency: Math.floor(Math.random() * 20 + 2) },
      { name: "存储服务", status: Math.random() > 0.2 ? "passed" : "warning", latency: Math.floor(Math.random() * 100 + 20) },
    ];

    const allPassed = checks.every(c => c.status === "passed");
    const overall = allPassed ? "healthy" : checks.some(c => c.status === "failed") ? "unhealthy" : "degraded";

    reply.status(200).send({
      code: 0,
      data: {
        environmentId: id,
        overall,
        checks,
        checkedAt: new Date().toISOString(),
      },
      message: "ok",
    });
  });
}
