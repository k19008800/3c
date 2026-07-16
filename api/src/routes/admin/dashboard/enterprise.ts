// ============================================================
//  3cloud (3C) — Admin Dashboard 企业相关
//  GET /api/v1/admin/dashboard/enterprise-users
//  GET /api/v1/admin/dashboard/enterprise-overview
//  GET /api/v1/admin/dashboard/enterprise-model-breakdown
//  GET /api/v1/admin/dashboard/enterprise-finance
//  GET /api/v1/admin/dashboard/enterprise-activity
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { users, callLogs, rechargeOrders, models, balanceLogs } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function enterpriseRoutes(app: FastifyInstance) {
  // 企业用户列表

  app.get("/api/v1/admin/dashboard/enterprise-users", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { keyword?: string; limit?: string; status?: string };
    const keyword = query.keyword;
    const status = query.status;
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));

    const conditions: any[] = [
      eq(users.userType, "enterprise"),
      sql`${users.deletedAt} IS NULL`,
    ];

    if (keyword) {
      conditions.push(
        sql`(${users.companyName}::text ILIKE ${`%${keyword}%`} OR ${users.email}::text ILIKE ${`%${keyword}%`})`
      );
    }

    if (status) {
      conditions.push(eq(users.status, status as any));
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        companyName: users.companyName,
        balance: users.balance,
        lastLoginAt: users.lastLoginAt,
        status: users.status,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.companyName, users.email)
      .limit(limit);

    reply.send({
      code: 0,
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        nickname: r.nickname,
        companyName: r.companyName,
        balance: r.balance,
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
        status: r.status,
      })),
      message: "ok",
    });
  });

  // 企业总体看板

  app.get("/api/v1/admin/dashboard/enterprise-overview", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:enterprise-overview");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const [enterpriseStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalBalance: sql<string>`coalesce(sum(${users.balance}::numeric), 0)`,
      })
      .from(users)
      .where(
        and(eq(users.userType, "enterprise"), sql`${users.deletedAt} IS NULL`)
      );

    const [monthNew] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(eq(users.userType, "enterprise"), gte(users.createdAt, monthStart), sql`${users.deletedAt} IS NULL`)
      );

    const [activeEnterprises] = await db
      .select({ count: sql<number>`count(DISTINCT ${callLogs.userId})::int` })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, monthStart),
          sql`${callLogs.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    const [monthConsumption] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, monthStart),
          sql`${callLogs.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    const [monthRecharge] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, monthStart),
          eq(rechargeOrders.status, "paid"),
          sql`${rechargeOrders.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    const [yesterdayConsumption] = await db
      .select({ totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)` })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, yesterdayStart),
          lt(callLogs.createdAt, todayStart),
          sql`${callLogs.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    const [lowBalance] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.userType, "enterprise"),
          eq(users.status, "active"),
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`
        )
      );

    const lowBalanceEnterpriseList = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        companyName: users.companyName,
        balance: users.balance,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          eq(users.userType, "enterprise"),
          eq(users.status, "active"),
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`
        )
      )
      .orderBy(sql`${users.balance}::numeric asc`)
      .limit(10);

    const result = {
      code: 0,
      data: {
        totalEnterprises: enterpriseStats.total,
        totalBalance: enterpriseStats.totalBalance,
        monthNewEnterprises: monthNew.count,
        activeEnterprises: activeEnterprises.count,
        monthConsumption: {
          totalCalls: monthConsumption.totalCalls,
          totalCost: monthConsumption.totalCost,
          totalTokens: Number(monthConsumption.totalTokens),
        },
        monthRecharge: {
          count: monthRecharge.count,
          total: monthRecharge.total,
        },
        yesterdayConsumption: yesterdayConsumption.totalCost,
        lowBalanceEnterpriseCount: lowBalance.count,
        lowBalanceEnterpriseList: lowBalanceEnterpriseList.map(u => ({
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          companyName: u.companyName,
          balance: u.balance,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    };

    redis.setex("dashboard:enterprise-overview", 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // 企业模型用量分解

  app.get("/api/v1/admin/dashboard/enterprise-model-breakdown", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { userId?: string; days?: string };
    const userId = parseInt(query.userId ?? "0", 10);
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    if (!userId) {
      return reply.status(400).send({ code: 1, data: null, message: "userId is required" });
    }

    const cacheKey = `dashboard:enterprise-model-breakdown:${userId}:${days}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

    const breakdown = await db
      .select({
        modelName: callLogs.modelName,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(
          sql`${callLogs.userId} = ${userId}`,
          gte(callLogs.createdAt, dayStart),
          sql`${callLogs.modelName} IS NOT NULL`
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*)::int desc`);

    const modelRows = breakdown.map(r => r.modelName).filter(Boolean) as string[];
    const modelInfos = modelRows.length > 0
      ? await db
        .select({ name: models.name, displayName: models.displayName, type: models.type })
        .from(models)
        .where(inArray(models.name, modelRows))
      : [];

    const modelInfoMap = new Map(modelInfos.map(m => [m.name, { displayName: m.displayName, type: m.type }]));

    const result = {
      code: 0,
      data: breakdown.map(r => {
        const info = modelInfoMap.get(r.modelName ?? "");
        return {
          modelName: r.modelName,
          displayName: info?.displayName ?? r.modelName,
          type: info?.type ?? "chat",
          totalCalls: r.totalCalls,
          successCalls: r.successCalls,
          successRate: r.totalCalls > 0 ? Number((r.successCalls / r.totalCalls * 100).toFixed(1)) : 100,
          totalTokens: Number(r.totalTokens),
          promptTokens: Number(r.promptTokens),
          completionTokens: Number(r.completionTokens),
          totalCost: r.totalCost,
          avgDuration: r.avgDuration,
        };
      }),
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // 企业财务流水

  app.get("/api/v1/admin/dashboard/enterprise-finance", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { userId?: string; days?: string };
    const userId = parseInt(query.userId ?? "0", 10);
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    if (!userId) {
      return reply.status(400).send({ code: 1, data: null, message: "userId is required" });
    }

    const cacheKey = `dashboard:enterprise-finance:${userId}:${days}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

    const balanceTrend = await db.execute(sql`
      SELECT DISTINCT ON (date_trunc('day', created_at))
        date_trunc('day', created_at)::date AS day,
        balance_after
      FROM balance_logs
      WHERE user_id = ${userId}
        AND created_at >= ${dayStart}
      ORDER BY date_trunc('day', created_at) DESC, created_at DESC
    `);

    const balanceEvents = await db
      .select({
        id: balanceLogs.id,
        amount: balanceLogs.amount,
        balanceAfter: balanceLogs.balanceAfter,
        type: balanceLogs.type,
        description: balanceLogs.description,
        createdAt: balanceLogs.createdAt,
      })
      .from(balanceLogs)
      .where(and(eq(balanceLogs.userId, userId), gte(balanceLogs.createdAt, dayStart)))
      .orderBy(sql`${balanceLogs.createdAt} desc`)
      .limit(200);

    const rechargeEvents = await db
      .select({
        id: rechargeOrders.id,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        createdAt: rechargeOrders.createdAt,
      })
      .from(rechargeOrders)
      .where(and(eq(rechargeOrders.userId, userId), gte(rechargeOrders.createdAt, dayStart)))
      .orderBy(sql`${rechargeOrders.createdAt} desc`)
      .limit(100);

    const [financeSummary] = await db
      .select({
        totalRecharge: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric) filter (where ${rechargeOrders.status} = 'paid'), 0)`,
        rechargeCount: sql<number>`count(*) filter (where ${rechargeOrders.status} = 'paid')::int`,
        totalConsumption: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        callCount: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .leftJoin(rechargeOrders, eq(callLogs.userId, rechargeOrders.userId))
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, dayStart)));

    const [rechargeStats] = await db
      .select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`, count: sql<number>`count(*)::int` })
      .from(rechargeOrders)
      .where(and(eq(rechargeOrders.userId, userId), eq(rechargeOrders.status, "paid"), gte(rechargeOrders.createdAt, dayStart)));

    const balanceTrendData = (balanceTrend.rows ?? []).map((r: any) => ({
      day: r.day ? new Date(r.day).toISOString().slice(0, 10) : null,
      balanceAfter: r.balance_after?.toString() ?? "0",
    }));

    const dateList: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      dateList.push(d.toISOString().slice(0, 10));
    }

    const balanceMap = new Map(balanceTrendData.filter((d: any) => d.day).map((d: any) => [d.day, d.balanceAfter]));
    let lastBalance = "0";
    const fullBalanceTrend = dateList.map(day => {
      if (balanceMap.has(day)) lastBalance = balanceMap.get(day);
      return { day, balance: lastBalance };
    });

    const events = balanceEvents.map(e => ({
      id: e.id,
      time: e.createdAt.toISOString(),
      type: e.type,
      amount: e.amount,
      balanceAfter: e.balanceAfter,
      description: e.description,
    }));

    const result = {
      code: 0,
      data: {
        balanceTrend: fullBalanceTrend,
        events,
        rechargeEvents: rechargeEvents.map(r => ({
          id: r.id,
          amount: r.amount,
          channel: r.channel,
          status: r.status,
          time: r.createdAt.toISOString(),
        })),
        summary: {
          totalRecharge: rechargeStats.total,
          rechargeCount: rechargeStats.count,
          totalConsumption: financeSummary.totalConsumption,
          callCount: financeSummary.callCount,
        },
      },
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // 企业活跃记录

  app.get("/api/v1/admin/dashboard/enterprise-activity", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { userId?: string; days?: string };
    const userId = parseInt(query.userId ?? "0", 10);
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    if (!userId) {
      return reply.status(400).send({ code: 1, data: null, message: "userId is required" });
    }

    const cacheKey = `dashboard:enterprise-activity:${userId}:${days}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

    const dailyActivity = await db
      .select({ day: sql<string>`${callLogs.createdAt}::date::text`, count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, dayStart)))
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    const hourlyDistribution = await db
      .select({ hour: sql<number>`EXTRACT(HOUR FROM ${callLogs.createdAt})::int`, count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, dayStart)))
      .groupBy(sql`EXTRACT(HOUR FROM ${callLogs.createdAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${callLogs.createdAt}) asc`);

    const ipDistribution = await db
      .select({ ip: callLogs.ip, count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, dayStart), sql`${callLogs.ip} IS NOT NULL`))
      .groupBy(callLogs.ip)
      .orderBy(sql`count(*)::int desc`)
      .limit(15);

    const modelRanking = await db
      .select({ modelName: callLogs.modelName, count: sql<number>`count(*)::int`, totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint` })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, dayStart), sql`${callLogs.modelName} IS NOT NULL`))
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*)::int desc`)
      .limit(10);

    const result = {
      code: 0,
      data: {
        dailyActivity: dailyActivity.map(r => ({ day: r.day, count: r.count })),
        hourlyDistribution: hourlyDistribution.map(r => ({ hour: r.hour, count: r.count })),
        ipDistribution: ipDistribution.map(r => ({ ip: r.ip, count: r.count })),
        modelRanking: modelRanking.map(r => ({ modelName: r.modelName, count: r.count, totalTokens: Number(r.totalTokens) })),
      },
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
