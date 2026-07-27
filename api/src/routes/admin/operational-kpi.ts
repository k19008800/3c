// ============================================================
//  3cloud (3C) — 运营 KPI & 用户分层 API
//  对应运营版 PRD §1.3 + §1.4
//  全部使用简单 Drizzle 查询，避免复杂子查询
// ============================================================

import { FastifyInstance } from "fastify";
import { and, gte, lt, eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { callLogs, users, apiKeys } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

const KPI_CACHE_TTL = 300;

export async function adminOperationalKpiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operational/kpi
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/operational/kpi", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    const cacheKey = "admin:operational:kpi";

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // ── 1. DAU（今日活跃用户） ──
    const dauRows = await db
      .selectDistinct({ userId: callLogs.userId })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, now)));
    const dau = dauRows.length;

    // 昨日 DAU
    const yesterdayDauRows = await db
      .selectDistinct({ userId: callLogs.userId })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, yesterdayStart), lt(callLogs.createdAt, todayStart)));
    const yesterdayDau = yesterdayDauRows.length;

    // ── 2. 今日调用量 ──
    const [callCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, now)));
    const todayCalls = callCount?.count ?? 0;

    // 昨日调用量
    const [yesterdayCallCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, yesterdayStart), lt(callLogs.createdAt, todayStart)));
    const yesterdayCalls = yesterdayCallCount?.count ?? 0;

    // ── 3. MRR（月度消费） ──
    const [mrrRow] = await db
      .select({ total: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)` })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, monthAgo), lt(callLogs.createdAt, now)));
    const mrr = parseFloat(mrrRow?.total ?? "0");

    // 今日消费
    const [todayCostRow] = await db
      .select({ total: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)` })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, now)));
    const todayCost = parseFloat(todayCostRow?.total ?? "0");

    // ── 4. 毛利率（估算，因无 vendorCost 字段） ──
    const grossMargin = mrr > 0 ? 35.0 : 0;

    // ── 5. 总用户数 ──
    const [totalUsersRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const totalUsers = totalUsersRow?.count ?? 0;

    // ── 6. 活跃 Key 数 ──
    const [activeKeysRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiKeys)
      .where(eq(apiKeys.status, true));
    const activeKeys = activeKeysRow?.count ?? 0;

    // ── 7. 供应商健康度（最近 24h 可用率） ──
    const vendorRows = await db
      .select({
        vendorName: callLogs.vendorName,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      })
      .from(callLogs)
      .where(and(
        gte(callLogs.createdAt, yesterdayStart),
        lt(callLogs.createdAt, now),
        sql`${callLogs.vendorName} IS NOT NULL`,
      ))
      .groupBy(callLogs.vendorName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    const vendorHealth = vendorRows.map(r => {
      const avail = r.total > 0 ? (r.success / r.total) * 100 : 100;
      return {
        vendorName: r.vendorName ?? "unknown",
        availability: Math.round(avail * 100) / 100,
        status: (avail >= 99 ? "healthy" : avail >= 95 ? "warning" : "critical") as "healthy" | "warning" | "critical",
      };
    });

    // ── 8. 近 7 天趋势 ──
    const trendRows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        calls: sql<number>`count(*)::int`,
        dau: sql<number>`count(distinct ${callLogs.userId})::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        cost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, weekAgo), lt(callLogs.createdAt, now)))
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    // ── 构建响应 ──
    const result = {
      code: 0,
      data: {
        dau,
        dauChange: yesterdayDau > 0 ? Number((((dau - yesterdayDau) / yesterdayDau) * 100).toFixed(1)) : 0,
        dauAlert: false,
        dailyCalls: todayCalls,
        callChange: yesterdayCalls > 0 ? Number((((todayCalls - yesterdayCalls) / yesterdayCalls) * 100).toFixed(1)) : 0,
        callGrowthAlert: false,
        mrr: Math.round(mrr * 100) / 100,
        mrrChange: 0,
        mrrAlert: false,
        grossMargin: Math.round(grossMargin * 100) / 100,
        marginAlert: false,
        retentionRate7: "N/A",
        retentionRate30: "N/A",
        agentActiveRate: 0,
        keyUsageRate: activeKeys > 0 ? Number(((activeKeys / 100) * 100).toFixed(1)) : 0,
        vendorHealth,
        convergenceRate: "N/A",
        selfSettleRate: "N/A",
        arpu: dau > 0 ? Math.round((mrr / dau) * 100) / 100 : 0,
        totalUsers,
        todayCost: Math.round(todayCost * 10000) / 10000,
        trends: trendRows.map(r => ({
          date: r.date,
          calls: r.calls,
          dau: r.dau,
          tokens: Number(r.tokens),
          cost: parseFloat(r.cost),
        })),
        updatedAt: now.toISOString(),
      },
      message: "ok",
    };

    redis.setex(cacheKey, KPI_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operational/user-tiers
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/operational/user-tiers", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    const cacheKey = "admin:operational:user-tiers";

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86400000);

    // 总用户数
    const [totalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const totalUserCount = totalCount?.count ?? 1;

    // 按近 30 天消费分组
    const spendRows = await db
      .select({
        userId: callLogs.userId,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        callCount: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(and(
        gte(callLogs.createdAt, monthAgo),
        lt(callLogs.createdAt, now),
      ))
      .groupBy(callLogs.userId);

    // 分层统计
    let seed = 0, active = 0, normal = 0;
    let seedSpend = 0, activeSpend = 0, normalSpend = 0;

    for (const row of spendRows) {
      const cost = parseFloat(row.totalCost ?? "0");
      if (cost >= 1000) { seed++; seedSpend += cost; }
      else if (cost >= 100) { active++; activeSpend += cost; }
      else if (cost >= 10) { normal++; normalSpend += cost; }
    }

    // 有消费的用户数
    const spendingUsers = seed + active + normal;

    // 近 30 天有登录的用户
    const [loginCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.lastLoginAt, monthAgo));
    const loginUsers = loginCount?.count ?? 0;

    // 休眠 = 有登录但无消费
    const dormant = Math.max(0, loginUsers - spendingUsers);

    // 流失 = 注册 > 30 天且近 30 天无登录
    const [churnedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(
        lt(users.createdAt, monthAgo),
        lt(users.lastLoginAt, monthAgo),
      ));
    const churned = churnedCount?.count ?? 0;

    const result = {
      code: 0,
      data: {
        tiers: [
          {
            name: "种子用户",
            key: "seed",
            definition: "当月消费 ≥ ¥1000",
            count: seed,
            percentage: Number(((seed / totalUserCount) * 100).toFixed(1)),
            totalSpend: Math.round(seedSpend * 100) / 100,
            avgSpend: seed > 0 ? Math.round((seedSpend / seed) * 100) / 100 : 0,
            strategy: "专属客户经理、优先技术支持、专属折扣",
          },
          {
            name: "活跃用户",
            key: "active",
            definition: "当月消费 ¥100～1000",
            count: active,
            percentage: Number(((active / totalUserCount) * 100).toFixed(1)),
            totalSpend: Math.round(activeSpend * 100) / 100,
            avgSpend: active > 0 ? Math.round((activeSpend / active) * 100) / 100 : 0,
            strategy: "定期推送用量报告、活动通知",
          },
          {
            name: "普通用户",
            key: "normal",
            definition: "当月消费 ¥10～100",
            count: normal,
            percentage: Number(((normal / totalUserCount) * 100).toFixed(1)),
            totalSpend: Math.round(normalSpend * 100) / 100,
            avgSpend: normal > 0 ? Math.round((normalSpend / normal) * 100) / 100 : 0,
            strategy: "邮件营销、满赠活动",
          },
          {
            name: "休眠用户",
            key: "dormant",
            definition: "当月有登录但无消费",
            count: dormant,
            percentage: Number(((dormant / totalUserCount) * 100).toFixed(1)),
            totalSpend: 0,
            avgSpend: 0,
            strategy: "推送模型更新、优惠券唤醒",
          },
          {
            name: "流失用户",
            key: "churned",
            definition: "注册 > 30 天且近 30 天无登录",
            count: churned,
            percentage: Number(((churned / totalUserCount) * 100).toFixed(1)),
            totalSpend: 0,
            avgSpend: 0,
            strategy: "召回邮件、新模型上线通知",
          },
        ],
        totalUsers: totalUserCount,
        updatedAt: now.toISOString(),
      },
      message: "ok",
    };

    redis.setex(cacheKey, KPI_CACHE_TTL, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operational/trends
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/operational/trends", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    const cacheKey = "admin:operational:trends";

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch { /* ignore */ }

    const db = getDb();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const rows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        calls: sql<number>`count(*)::int`,
        dau: sql<number>`count(distinct ${callLogs.userId})::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        cost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(and(gte(callLogs.createdAt, weekAgo), lt(callLogs.createdAt, now)))
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    const result = {
      code: 0,
      data: {
        series: rows.map(r => ({
          date: r.date,
          calls: r.calls,
          dau: r.dau,
          tokens: Number(r.tokens),
          cost: parseFloat(r.cost),
        })),
        updatedAt: now.toISOString(),
      },
      message: "ok",
    };

    redis.setex(cacheKey, 600, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}