// ============================================================
//  3cloud (3C) — Admin Dashboard 营收分析
//  GET /api/v1/admin/dashboard/revenue-analysis
// ============================================================

import { FastifyInstance } from "fastify";
import { and, gte, lt, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { callLogs, models, rechargeOrders } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function revenueRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/revenue-analysis", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:revenue");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. 今日营收按模型类型分组
    const revenueByType = await db
      .select({
        modelName: callLogs.modelName,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd))
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`sum(${callLogs.cost}::numeric) desc`);

    const allModels = await db
      .select({ name: models.name, type: models.type, displayName: models.displayName })
      .from(models);
    const typeMap = new Map(allModels.map((m) => [m.name, { type: m.type, displayName: m.displayName }]));

    const typeBuckets: Record<string, { cost: number; tokens: number; count: number; models: string[] }> = {};
    for (const r of revenueByType) {
      const modelInfo = typeMap.get(r.modelName ?? "") ?? { type: "chat", displayName: null };
      const bucket = typeBuckets[modelInfo.type] ?? { cost: 0, tokens: 0, count: 0, models: [] };
      bucket.cost += Number(r.totalCost);
      bucket.tokens += r.totalTokens;
      bucket.count += r.count;
      if (!bucket.models.includes(r.modelName ?? "")) bucket.models.push(r.modelName ?? "");
      typeBuckets[modelInfo.type] = bucket;
    }

    // 2. 今日支付渠道分布
    const channelRevenue = await db
      .select({
        channel: rechargeOrders.channel,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, todayStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      )
      .groupBy(rechargeOrders.channel);

    // 3. 本月每日营收趋势
    const monthlyRevenueTrend = await db
      .select({
        date: sql<string>`${rechargeOrders.createdAt}::date::text`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, monthStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      )
      .groupBy(sql`${rechargeOrders.createdAt}::date`)
      .orderBy(sql`${rechargeOrders.createdAt}::date asc`);

    // 4. 本月累计调用成本（用于毛利率计算）
    const [monthCallCost] = await db
      .select({ total: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)` })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, monthStart), lt(callLogs.createdAt, todayEnd))
      );

    const [monthRecharge] = await db
      .select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)` })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, monthStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      );

    const monthRevenue = Number(monthRecharge.total);
    const monthCostVal = Number(monthCallCost.total);

    const result = {
      code: 0,
      data: {
        today: {
          byType: Object.entries(typeBuckets).map(([type, data]) => ({
            type,
            cost: data.cost.toFixed(6),
            tokens: data.tokens,
            count: data.count,
            models: data.models,
          })),
          byChannel: channelRevenue.map((r) => ({
            channel: r.channel,
            total: r.total,
            count: r.count,
          })),
        },
        month: {
          startDate: monthStart.toISOString().slice(0, 10),
          revenue: monthRevenue.toFixed(6),
          cost: monthCostVal.toFixed(6),
          profitRate: monthRevenue > 0
            ? Number((((monthRevenue - monthCostVal) / monthRevenue) * 100).toFixed(1))
            : 0,
          revenueTrend: monthlyRevenueTrend.map((r) => ({
            date: r.date,
            total: r.total,
            count: r.count,
          })),
        },
      },
      message: "ok",
    };

    redis.setex("dashboard:revenue", 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
