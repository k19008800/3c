// ============================================================
//  3cloud (3C) — Admin Dashboard 趋势数据
//  GET /api/v1/admin/dashboard/trends/hourly
//  GET /api/v1/admin/dashboard/trends
// ============================================================

import { FastifyInstance } from "fastify";
import { and, gte, lt, sql, eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { callLogs, users, rechargeOrders } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function trendsRoutes(app: FastifyInstance) {
  // 小时级下钻

  app.get("/api/v1/admin/dashboard/trends/hourly", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { date?: string };
    const dateStr = query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return reply.status(400).send({ code: 1, message: "请提供有效的日期参数 (YYYY-MM-DD)" });
    }

    const hourlyCacheKey = `dashboard:hourly:${dateStr}`;
    try {
      const cached = await redis.get(hourlyCacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const dayStart = new Date(dateStr + "T00:00:00+08:00");
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const hourlyCalls = await db
      .select({
        hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd))
      )
      .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
      .orderBy(sql`extract(hour from ${callLogs.createdAt}) asc`);

    const topModels = await db
      .select({
        modelName: callLogs.modelName,
        total: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd))
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    const hourMap = new Map(hourlyCalls.map((r) => [r.hour, r]));
    const hours: {
      hour: number;
      total: number;
      success: number;
      failed: number;
      timedout: number;
      totalTokens: number;
      totalCost: string;
    }[] = [];
    for (let h = 0; h < 24; h++) {
      const e = hourMap.get(h);
      hours.push({
        hour: h,
        total: e?.total ?? 0,
        success: e?.success ?? 0,
        failed: e?.failed ?? 0,
        timedout: e?.timedout ?? 0,
        totalTokens: Number(e?.totalTokens ?? 0),
        totalCost: e?.totalCost ?? "0",
      });
    }

    const peakHour = hours.reduce((a, b) => (a.total >= b.total ? a : b));
    const peakHourStart = new Date(dayStart.getTime() + peakHour.hour * 3600000);
    const peakHourEnd = new Date(peakHourStart.getTime() + 3600000);
    const peakTopModels = await db
      .select({
        modelName: callLogs.modelName,
        total: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, peakHourStart),
          lt(callLogs.createdAt, peakHourEnd)
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(3);

    const hourlyResult = {
      code: 0,
      data: {
        date: dateStr,
        total: hours.reduce((a, h) => a + h.total, 0),
        hours,
        topModels,
        peakHour: {
          hour: peakHour.hour,
          total: peakHour.total,
          topModels: peakTopModels,
        },
      },
      message: "ok",
    };

    redis.setex(hourlyCacheKey, 300, JSON.stringify(hourlyResult)).catch(() => {});
    reply.send(hourlyResult);
  });

  // 多日趋势

  app.get("/api/v1/admin/dashboard/trends", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { days?: string; userType?: string; userId?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));
    const userType = query.userType;
    const userId = query.userId;

    let cacheSuffix = ':all';
    if (userId) cacheSuffix = `:uid:${userId}`;
    else if (userType) cacheSuffix = `:${userType}`;
    const trendsCacheKey = `dashboard:trends:${days}${cacheSuffix}`;
    try {
      const cached = await redis.get(trendsCacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();

    const dayRanges: { label: string; start: Date; end: Date }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(d.getTime() + 86400000);
      dayRanges.push({
        label: d.toISOString().slice(0, 10),
        start: d,
        end,
      });
    }

    const dayStart = dayRanges[0].start;
    const dayEnd = dayRanges[days - 1].end;

    const dateFilter = and(
      gte(callLogs.createdAt, dayStart),
      lt(callLogs.createdAt, dayEnd)
    );

    const userFilter = userId
      ? sql`${callLogs.userId} = ${parseInt(userId, 10)}`
      : userType
        ? sql`${callLogs.userId} IN (SELECT id FROM users WHERE user_type = ${userType})`
        : undefined;

    const combinedFilter = userFilter ? and(dateFilter as any, userFilter as any) : dateFilter;

    const callsTrend = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(combinedFilter as any)
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    const usersTrend = await db
      .select({
        date: sql<string>`${users.createdAt}::date::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(
        and(
          gte(users.createdAt, dayStart),
          lt(users.createdAt, dayEnd),
          sql`${users.deletedAt} IS NULL`
        )
      )
      .groupBy(sql`${users.createdAt}::date`)
      .orderBy(sql`${users.createdAt}::date asc`);

    const revenueTrend = await db
      .select({
        date: sql<string>`${rechargeOrders.createdAt}::date::text`,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, dayStart),
          lt(rechargeOrders.createdAt, dayEnd),
          eq(rechargeOrders.status, "paid")
        )
      )
      .groupBy(sql`${rechargeOrders.createdAt}::date`)
      .orderBy(sql`${rechargeOrders.createdAt}::date asc`);

    const callsMap = new Map<string, any>(callsTrend.map((r) => [r.date, r]));
    const usersMap = new Map<string, any>(usersTrend.map((r) => [r.date, r]));
    const revenueMap = new Map<string, any>(revenueTrend.map((r) => [r.date, r]));

    const series = dayRanges.map((dr) => {
      const c = callsMap.get(dr.label);
      const u = usersMap.get(dr.label);
      const r = revenueMap.get(dr.label);
      const total = c?.total ?? 0;
      const success = c?.success ?? 0;
      return {
        date: dr.label,
        calls: {
          total,
          success,
          failed: c?.failed ?? 0,
          timeout: c?.timedout ?? 0,
          successRate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100,
          totalTokens: Number(c?.totalTokens ?? 0),
          totalCost: c?.totalCost ?? "0",
          avgDuration: c?.avgDuration ?? 0,
        },
        newUsers: u?.count ?? 0,
        revenue: {
          count: r?.count ?? 0,
          total: r?.total ?? "0",
        },
      };
    });

    const trendsResult = {
      code: 0,
      data: {
        days,
        series,
      },
      message: "ok",
    };

    redis.setex(trendsCacheKey, 300, JSON.stringify(trendsResult)).catch(() => {});
    reply.send(trendsResult);
  });
}
