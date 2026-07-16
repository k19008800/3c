// ============================================================
//  3cloud (3C) — 失败分析路由
//  GET /api/v1/admin/logs/failure-analysis — 失败聚合分析
//  GET /api/v1/admin/logs/:id/context — 完整调用上下文
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lte, sql, desc, like } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminLogAnalysisRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 失败分析 ──
  app.get("/api/v1/admin/logs/failure-analysis", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as any;
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const since = new Date(Date.now() - days * 86400000);

    // 概览
    const [overview] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalFailed: sql<number>`count(*) FILTER (WHERE status IN ('failed','timeout'))::int`,
        avgDurationMs: sql<number>`coalesce(round(avg(duration_ms) FILTER (WHERE status IN ('failed','timeout'))), 0)::int`,
      })
      .from(callLogs)
      .where(gte(callLogs.createdAt, since));

    const totalCalls = overview?.totalCalls ?? 0;
    const totalFailed = overview?.totalFailed ?? 0;

    // 按错误类型
    const byErrorType = await db
      .select({
        errorType: sql<string>`CASE
          WHEN status = 'timeout' THEN 'timeout'
          WHEN status = 'rate_limited' THEN 'rate_limited'
          WHEN status IN ('failed') AND error_message LIKE '4%' THEN '4xx'
          WHEN status IN ('failed') AND error_message LIKE '5%' THEN '5xx'
          WHEN status = 'failed' THEN 'other_error'
          ELSE status
        END`,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(and(
        gte(callLogs.createdAt, since),
        sql`status IN ('failed', 'timeout', 'rate_limited')`,
      ))
      .groupBy(sql`1`)
      .orderBy(sql`2 DESC`);

    // 按模型
    const byModel = await db
      .select({
        modelName: callLogs.modelName,
        failed: sql<number>`count(*) FILTER (WHERE status IN ('failed','timeout'))::int`,
        total: sql<number>`count(*)::int`,
        rate: sql<number>`round(
          count(*) FILTER (WHERE status IN ('failed','timeout'))::numeric
          / NULLIF(count(*), 0) * 100, 1
        )`,
      })
      .from(callLogs)
      .where(gte(callLogs.createdAt, since))
      .groupBy(callLogs.modelName)
      .orderBy(sql`3 DESC`)
      .limit(20);

    // 时序（按天）
    const timeSeries = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        total: sql<number>`count(*)::int`,
        failed: sql<number>`count(*) FILTER (WHERE status IN ('failed','timeout'))::int`,
      })
      .from(callLogs)
      .where(gte(callLogs.createdAt, since))
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const failureRate = totalCalls > 0 ? Math.round((totalFailed / totalCalls) * 1000) / 10 : 0;

    return {
      code: 0,
      data: {
        summary: {
          totalCalls,
          totalFailed,
          failureRate,
          avgDurationMs: overview?.avgDurationMs ?? 0,
        },
        byErrorType,
        byModel,
        timeSeries,
      },
      message: "ok",
    };
  });

  // ── 单条日志完整上下文 ──
  app.get("/api/v1/admin/logs/:id/context", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const db = getDb();

    const [log] = await db
      .select()
      .from(callLogs)
      .where(eq(callLogs.id, Number(id)));

    if (!log) {
      return reply.status(404).send({ code: 404, data: null, message: "记录不存在" });
    }

    // 补充用户信息
    const { users } = await import("../../db/schema.js");
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, log.userId));

    return {
      code: 0,
      data: {
        callLog: log,
        clientInfo: {
          ip: log.ip,
          userAgent: log.userAgent,
        },
        userEmail: user?.email,
      },
      message: "ok",
    };
  });
}
