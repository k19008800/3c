// ============================================================
//  3cloud (3C) — Admin 用量聚合统计路由
//  GET /api/v1/admin/stats/overview     — 平台汇总（7d|30d|90d）
//  GET /api/v1/admin/stats/by-model     — 按模型统计
//  GET /api/v1/admin/stats/by-vendor    — 按供应商统计
//  GET /api/v1/admin/stats/by-user      — 按用户统计
//  GET /api/v1/admin/stats/hourly       — 按小时分布
//  GET /api/v1/admin/stats/trend        — 趋势数据
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { callLogs, models, vendors, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// ── 性能策略缓存 TTL ──
const RECENT_CACHE_TTL = 300;   // 5 分钟（最近 7 天走原始查询 + 缓存）
const HISTORICAL_TTL = 600;     // 10 分钟（7 天以上走物化视图，或直接查）

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "7d": return new Date(now.getTime() - 7 * 86400000);
    case "30d": return new Date(now.getTime() - 30 * 86400000);
    case "90d": return new Date(now.getTime() - 90 * 86400000);
    default: return new Date(now.getTime() - 7 * 86400000);
  }
}

export async function adminStatsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/overview — 平台汇总
  //  Query: period=7d|30d|90d
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/overview", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { period?: string };
    const period = query.period ?? "7d";
    const startDate = getPeriodStart(period);
    const now = new Date();

    const redis = getRedis();
    const cacheKey = `admin:stats:overview:${period}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();

    // 平台汇总统计
    const [overview] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timeoutCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
        uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, now),
        )
      );

    const result = {
      code: 0,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        ...overview,
        successRate: overview.totalCalls > 0
          ? Number(((overview.successCalls / overview.totalCalls) * 100).toFixed(2))
          : 100,
      },
      message: "ok",
    };

    redis.setex(cacheKey, RECENT_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/by-model — 按模型统计
  //  Query: start=&end=
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/by-model", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { start?: string; end?: string; limit?: string };
    const startDate = query.start ? new Date(query.start) : getPeriodStart("30d");
    const endDate = query.end ? new Date(query.end) : new Date();
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10)));

    const redis = getRedis();
    const cacheKey = `admin:stats:by-model:${startDate.toISOString().slice(0,10)}:${endDate.toISOString().slice(0,10)}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

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
        uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, endDate),
          sql`${callLogs.modelName} IS NOT NULL`,
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*)::int desc`)
      .limit(limit);

    // 补充模型显示名
    const modelNames = rows.map(r => r.modelName).filter(Boolean) as string[];
    let modelInfoMap = new Map<string, { displayName: string | null; type: string }>();
    if (modelNames.length > 0) {
      const mRows = await db
        .select({ name: models.name, displayName: models.displayName, type: models.type })
        .from(models)
        .where(inArray(models.name, modelNames));
      modelInfoMap = new Map(mRows.map(m => [m.name, m]));
    }

    const result = {
      code: 0,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        items: rows.map(r => ({
          ...r,
          displayName: modelInfoMap.get(r.modelName ?? "")?.displayName ?? r.modelName,
          modelType: modelInfoMap.get(r.modelName ?? "")?.type ?? "chat",
          successRate: r.totalCalls > 0
            ? Number(((r.successCalls / r.totalCalls) * 100).toFixed(2))
            : 100,
        })),
      },
      message: "ok",
    };

    redis.setex(cacheKey, RECENT_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/by-vendor — 按供应商统计
  //  Query: start=&end=
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/by-vendor", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { start?: string; end?: string; limit?: string };
    const startDate = query.start ? new Date(query.start) : getPeriodStart("30d");
    const endDate = query.end ? new Date(query.end) : new Date();
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10)));

    const redis = getRedis();
    const cacheKey = `admin:stats:by-vendor:${startDate.toISOString().slice(0,10)}:${endDate.toISOString().slice(0,10)}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();

    const rows = await db
      .select({
        vendorName: callLogs.vendorName,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
        uniqueModels: sql<number>`count(distinct ${callLogs.modelName})::int`,
        uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, endDate),
          sql`${callLogs.vendorName} IS NOT NULL`,
        )
      )
      .groupBy(callLogs.vendorName)
      .orderBy(sql`count(*)::int desc`)
      .limit(limit);

    const result = {
      code: 0,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        items: rows.map(r => ({
          ...r,
          successRate: r.totalCalls > 0
            ? Number(((r.successCalls / r.totalCalls) * 100).toFixed(2))
            : 100,
        })),
      },
      message: "ok",
    };

    redis.setex(cacheKey, RECENT_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/by-user — 按用户统计
  //  Query: limit=50&days=30
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/by-user", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { limit?: string; days?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "50", 10)));

    const redis = getRedis();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000);
    const cacheKey = `admin:stats:by-user:${days}:${limit}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();

    const rows = await db
      .select({
        userId: callLogs.userId,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, startDate),
          lt(callLogs.createdAt, now),
        )
      )
      .groupBy(callLogs.userId)
      .orderBy(sql`count(*)::int desc`)
      .limit(limit);

    // 补充用户邮箱和昵称
    const userIds = rows.map(r => r.userId).filter(Boolean) as number[];
    let userInfoMap = new Map<number, { email: string; nickname: string | null }>();
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, email: users.email, nickname: users.nickname })
        .from(users)
        .where(inArray(users.id, userIds));
      userInfoMap = new Map(userRows.map(u => [u.id, u]));
    }

    const result = {
      code: 0,
      data: {
        days,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        items: rows.map(r => {
          const user = userInfoMap.get(r.userId);
          return {
            userId: r.userId,
            email: user?.email ?? "未知",
            nickname: user?.nickname ?? null,
            totalCalls: r.totalCalls,
            totalTokens: Number(r.totalTokens),
            totalCost: r.totalCost,
            avgDuration: r.avgDuration,
            successRate: r.totalCalls > 0
              ? Number(((r.successCalls / r.totalCalls) * 100).toFixed(2))
              : 100,
          };
        }),
      },
      message: "ok",
    };

    redis.setex(cacheKey, RECENT_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/hourly — 按小时分布
  //  Query: date=YYYY-MM-DD
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/hourly", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { date?: string };
    const dateStr = query.date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return reply.status(400).send({ code: 1, message: "无效日期格式 (YYYY-MM-DD)" });
    }

    const redis = getRedis();
    const cacheKey = `admin:stats:hourly:${dateStr}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();
    const dayStart = new Date(dateStr + "T00:00:00+08:00");
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const hourlyData = await db
      .select({
        hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, dayStart),
          lt(callLogs.createdAt, dayEnd),
        )
      )
      .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
      .orderBy(sql`extract(hour from ${callLogs.createdAt}) asc`);

    // 填满 24h
    const hourMap = new Map(hourlyData.map(r => [r.hour, r]));
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const e = hourMap.get(h);
      hours.push({
        hour: h,
        totalCalls: e?.totalCalls ?? 0,
        successCalls: e?.successCalls ?? 0,
        totalTokens: Number(e?.totalTokens ?? 0),
        totalCost: e?.totalCost ?? "0",
        avgDuration: e?.avgDuration ?? 0,
      });
    }

    const result = {
      code: 0,
      data: { date: dateStr, hours },
      message: "ok",
    };

    redis.setex(cacheKey, RECENT_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/trend — 趋势数据
  //  Query: days=30 (默认 30 天)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/trend", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    const redis = getRedis();
    const cacheKey = `admin:stats:trend:${days}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000);

    const rows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
        uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
      })
      .from(callLogs)
      .where(
        and(
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
        successCalls: e?.successCalls ?? 0,
        successRate: e && e.totalCalls > 0
          ? Number(((e.successCalls / e.totalCalls) * 100).toFixed(1))
          : 100,
        totalTokens: Number(e?.totalTokens ?? 0),
        totalCost: e?.totalCost ?? "0",
        avgDuration: e?.avgDuration ?? 0,
        uniqueUsers: e?.uniqueUsers ?? 0,
      });
    }

    const result = {
      code: 0,
      data: { days, series },
      message: "ok",
    };

    redis.setex(cacheKey, RECENT_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats/export — 导出统计 CSV
  //  Query: period=7d|30d|90d&type=overview|by-model|by-user|trend
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats/export", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { period?: string; type?: string };
    const period = query.period ?? "30d";
    const dataType = query.type ?? "overview";
    const startDate = getPeriodStart(period);
    const now = new Date();

    const db = getDb();

    let csvHeaders = "";
    let csvRows: string[] = [];

    try {
      if (dataType === "overview") {
        const [row] = await db
          .select({
            totalCalls: sql<number>`count(*)::int`,
            successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
            totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
            avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
            uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
          })
          .from(callLogs)
          .where(and(gte(callLogs.createdAt, startDate), lt(callLogs.createdAt, now)));

        csvHeaders = "指标,值";
        csvRows = [
          `总调用量,${row?.totalCalls ?? 0}`,
          `成功调用量,${row?.successCalls ?? 0}`,
          `总Token,${row?.totalTokens ?? 0}`,
          `总花费,${row?.totalCost ?? "0"}`,
          `平均延迟(ms),${row?.avgDuration ?? 0}`,
          `活跃用户数,${row?.uniqueUsers ?? 0}`,
          `成功率,${row && row.totalCalls > 0 ? Number(((row.successCalls / row.totalCalls) * 100).toFixed(2)) : 100}%`,
        ];
      } else if (dataType === "by-model") {
        const rows = await db
          .select({
            modelName: callLogs.modelName,
            totalCalls: sql<number>`count(*)::int`,
            totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          })
          .from(callLogs)
          .where(and(gte(callLogs.createdAt, startDate), lt(callLogs.createdAt, now), sql`${callLogs.modelName} IS NOT NULL`))
          .groupBy(callLogs.modelName)
          .orderBy(sql`count(*)::int desc`);

        csvHeaders = "模型,调用量,Token数,花费";
        csvRows = rows.map(r => `${r.modelName},${r.totalCalls},${r.totalTokens},${r.totalCost}`);
      } else if (dataType === "by-user") {
        const rows = await db
          .select({
            userId: callLogs.userId,
            totalCalls: sql<number>`count(*)::int`,
            totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          })
          .from(callLogs)
          .where(and(gte(callLogs.createdAt, startDate), lt(callLogs.createdAt, now)))
          .groupBy(callLogs.userId)
          .orderBy(sql`count(*)::int desc`);

        const userIds = rows.map(r => r.userId).filter(Boolean);
        let emailMap = new Map<number, string>();
        if (userIds.length > 0) {
          const urows = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, userIds as number[]));
          emailMap = new Map(urows.map(u => [u.id, u.email]));
        }

        csvHeaders = "用户ID,邮箱,调用量,Token数,花费";
        csvRows = rows.map(r => `${r.userId},${emailMap.get(r.userId) ?? "未知"},${r.totalCalls},${r.totalTokens},${r.totalCost}`);
      } else {
        // trend
        const days = Math.min(90, Math.max(1, parseInt(period === "7d" ? "7" : period === "30d" ? "30" : "90", 10)));
        const trendStart = new Date(now.getTime() - days * 86400000);

        const rows = await db
          .select({
            date: sql<string>`${callLogs.createdAt}::date::text`,
            totalCalls: sql<number>`count(*)::int`,
            totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
            uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
          })
          .from(callLogs)
          .where(and(gte(callLogs.createdAt, trendStart), lt(callLogs.createdAt, now)))
          .groupBy(sql`${callLogs.createdAt}::date`)
          .orderBy(sql`${callLogs.createdAt}::date asc`);

        csvHeaders = "日期,调用量,Token数,花费,活跃用户";
        csvRows = rows.map(r => `${r.date},${r.totalCalls},${r.totalTokens},${r.totalCost},${r.uniqueUsers}`);
      }

      const csv = "﻿" + csvHeaders + "\n" + csvRows.join("\n");
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="stats-${dataType}-${period}.csv"`);
      reply.send(csv);
    } catch (err) {
      reply.status(500).send({ code: 500, data: null, message: "导出失败" });
    }
  });
}
