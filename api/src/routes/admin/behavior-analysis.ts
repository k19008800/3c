// ============================================================
//  3cloud (3C) — 用户行为分析
//  基于操作日志的多维度用户行为画像
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, gte, and, sql, like, ne, count, sum } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs, users, apiKeys } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

export async function adminBehaviorAnalysisRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  行为分析概览统计
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/behavior-analysis/overview
  app.get("/api/v1/admin/behavior-analysis/overview", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeUsers, totalOperations, avgDailyOps] = await Promise.all([
      db
        .select({ count: sql<number>`count(DISTINCT user_id)` })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, thirtyDaysAgo)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, thirtyDaysAgo)),
      db
        .select({
          avg: sql<number>`ROUND(count(*)::numeric / 30, 1)`,
        })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, thirtyDaysAgo)),
    ]);

    reply.status(200).send({
      code: 0,
      data: {
        activeUsers: Number(activeUsers[0]?.count ?? 0),
        totalOperations: Number(totalOperations[0]?.count ?? 0),
        avgDailyOperations: Number(avgDailyOps[0]?.avg ?? 0),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  每日操作趋势（近 30 天）
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/behavior-analysis/trend
  app.get("/api/v1/admin/behavior-analysis/trend", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const query = request.query as any;
    const days = parseInt(query.days || "30", 10);
    const db = getDb();

    const trend = await db
      .select({
        date: sql<string>`to_char(created_at, 'MM-DD')`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) FILTER (WHERE status = 'success')::int`,
        failure: sql<number>`count(*) FILTER (WHERE status = 'failure')::int`,
        uniqueUsers: sql<number>`count(DISTINCT user_id)::int`,
      })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, sql`CURRENT_DATE - ${sql.raw(days.toString())}::int * INTERVAL '1 day'`))
      .groupBy(sql`to_char(created_at, 'MM-DD')`)
      .orderBy(sql`to_char(created_at, 'MM-DD')`);

    reply.status(200).send({
      code: 0,
      data: { list: trend },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  操作类型分布
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/behavior-analysis/action-distribution
  app.get("/api/v1/admin/behavior-analysis/action-distribution", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const distribution = await db
      .select({
        action: operationLogs.action,
        count: sql<number>`count(*)::int`,
        failCount: sql<number>`count(*) FILTER (WHERE status = 'failure')::int`,
        uniqueUsers: sql<number>`count(DISTINCT user_id)::int`,
      })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, thirtyDaysAgo))
      .groupBy(operationLogs.action)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    reply.status(200).send({
      code: 0,
      data: { list: distribution },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  活跃时段分析（小时分布）
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/behavior-analysis/hourly-distribution
  app.get("/api/v1/admin/behavior-analysis/hourly-distribution", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const hourly = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM created_at)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, thirtyDaysAgo))
      .groupBy(sql`EXTRACT(HOUR FROM created_at)`)
      .orderBy(sql`EXTRACT(HOUR FROM created_at)`);

    reply.status(200).send({
      code: 0,
      data: { list: hourly },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  最活跃用户 Top 20
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/behavior-analysis/top-users
  app.get("/api/v1/admin/behavior-analysis/top-users", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || "20", 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const db = getDb();

    const topUsers = await db
      .select({
        userId: operationLogs.userId,
        count: sql<number>`count(*)::int`,
        failCount: sql<number>`count(*) FILTER (WHERE status = 'failure')::int`,
        lastActive: sql<string>`max(created_at)`,
        actions: sql<string>`array_to_string(array_agg(DISTINCT action), ', ')`,
      })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, thirtyDaysAgo))
      .groupBy(operationLogs.userId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    reply.status(200).send({
      code: 0,
      data: { list: topUsers },
      message: "ok",
    });
  });
}
