// ============================================================
//  3cloud (3C) — 用户端统计 & 额度查询路由
//  GET /api/v1/me/quota           — 查看我的额度信息
//  GET /api/v1/me/stats/usage     — 我的用量统计
//  GET /api/v1/me/stats/by-model  — 我按模型的用量排行
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { callLogs } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { getUserQuotaInfo } from "../services/quota-service.js";

export async function meStatsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/quota — 查看我的额度
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/quota", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const quotaInfo = await getUserQuotaInfo(userId);

      reply.send({
        code: 0,
        data: quotaInfo,
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `查询额度失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats — 我的用量概览
  //  Query: period=7d|30d
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/usage", async (request, reply) => {
    const query = request.query as { period?: string };
    const period = query.period ?? "7d";
    const userId = request.user!.userId;

    const now = new Date();
    const startDate = period === "30d"
      ? new Date(now.getTime() - 30 * 86400000)
      : new Date(now.getTime() - 7 * 86400000);

    const db = getDb();

    const [usage] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, now),
        )
      );

    reply.send({
      code: 0,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        ...usage,
        successRate: usage.totalCalls > 0
          ? Number(((usage.successCalls / usage.totalCalls) * 100).toFixed(2))
          : 100,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats/by-model — 我按模型的用量排行
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/by-model", async (request, reply) => {
    const query = request.query as { period?: string; limit?: string };
    const period = query.period ?? "30d";
    const userId = request.user!.userId;
    const limit = Math.min(20, Math.max(1, parseInt(query.limit ?? "10", 10)));

    const now = new Date();
    const startDate = period === "7d"
      ? new Date(now.getTime() - 7 * 86400000)
      : period === "90d"
        ? new Date(now.getTime() - 90 * 86400000)
        : new Date(now.getTime() - 30 * 86400000);

    const db = getDb();

    const rows = await db
      .select({
        modelName: callLogs.modelName,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, now),
          sql`${callLogs.modelName} IS NOT NULL`,
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*)::int desc`)
      .limit(limit);

    reply.send({
      code: 0,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        items: rows.map(r => ({
          ...r,
          successRate: r.totalCalls > 0
            ? Number(((r.successCalls / r.totalCalls) * 100).toFixed(2))
            : 100,
        })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats/daily — 我近期的每日用量
  //  Query: days=7|30
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/daily", async (request, reply) => {
    const query = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const userId = request.user!.userId;

    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000);

    const db = getDb();

    const rows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        totalCalls: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, now),
        )
      )
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    // 填满缺失天
    const dataMap = new Map(rows.map(r => [r.date, r]));
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + i + 1);
      const dateKey = d.toISOString().slice(0, 10);
      const e = dataMap.get(dateKey);
      series.push({
        date: dateKey,
        totalCalls: e?.totalCalls ?? 0,
        totalTokens: Number(e?.totalTokens ?? 0),
        totalCost: e?.totalCost ?? "0",
      });
    }

    reply.send({
      code: 0,
      data: { days, series },
      message: "ok",
    });
  });
}
