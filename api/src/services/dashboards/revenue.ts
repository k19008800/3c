// ============================================================
//  3cloud (3C) — Dashboard Revenue Analysis Service
//  GET /api/v1/admin/dashboard/revenue-analysis — 营收分析
// ============================================================

import { eq, and, gte, lt, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { callLogs, models, rechargeOrders } from "../../db/schema.js";

export interface RevenueAnalysisResult {
  code: number;
  data: {
    today: {
      byType: Array<{ type: string; cost: string; tokens: number; count: number; models: string[] }>;
      byChannel: Array<{ channel: string | null; total: string; count: number }>;
    };
    month: {
      startDate: string; revenue: string; cost: string; profitRate: number;
      revenueTrend: Array<{ date: string; total: string; count: number }>;
    };
  };
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildRevenue(db: any, _redis: Redis): Promise<RevenueAnalysisResult> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const revenueByType = await db
    .select({
      modelName: callLogs.modelName,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .where(and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd)))
    .groupBy(callLogs.modelName)
    .orderBy(sql`sum(${callLogs.cost}::numeric) desc`);

  const allModels = await db.select({ name: models.name, type: models.type, displayName: models.displayName }).from(models);
  const typeMap = new Map<any, { type: string; displayName: string | null }>(allModels.map((m: any) => [m.name, { type: m.type, displayName: m.displayName }]));

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

  const channelRevenue = await db
    .select({
      channel: rechargeOrders.channel,
      total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(rechargeOrders)
    .where(and(gte(rechargeOrders.createdAt, todayStart), lt(rechargeOrders.createdAt, todayEnd), eq(rechargeOrders.status, "paid")))
    .groupBy(rechargeOrders.channel);

  const monthlyRevenueTrend = await db
    .select({
      date: sql<string>`${rechargeOrders.createdAt}::date::text`,
      total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(rechargeOrders)
    .where(and(gte(rechargeOrders.createdAt, monthStart), lt(rechargeOrders.createdAt, todayEnd), eq(rechargeOrders.status, "paid")))
    .groupBy(sql`${rechargeOrders.createdAt}::date`)
    .orderBy(sql`${rechargeOrders.createdAt}::date asc`);

  const [monthCallCost] = await db.select({ total: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)` }).from(callLogs).where(and(gte(callLogs.createdAt, monthStart), lt(callLogs.createdAt, todayEnd)));
  const [monthRecharge] = await db.select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)` }).from(rechargeOrders).where(and(gte(rechargeOrders.createdAt, monthStart), lt(rechargeOrders.createdAt, todayEnd), eq(rechargeOrders.status, "paid")));

  const monthRevenue = Number(monthRecharge.total);
  const monthCostVal = Number(monthCallCost.total);

  return {
    code: 0,
    data: {
      today: {
        byType: Object.entries(typeBuckets).map(([type, data]: [string, any]) => ({
          type, cost: data.cost.toFixed(6), tokens: data.tokens, count: data.count, models: data.models,
        })),
        byChannel: channelRevenue.map((r: any) => ({ channel: r.channel, total: r.total, count: r.count })),
      },
      month: {
        startDate: monthStart.toISOString().slice(0, 10),
        revenue: monthRevenue.toFixed(6), cost: monthCostVal.toFixed(6),
        profitRate: monthRevenue > 0 ? Number((((monthRevenue - monthCostVal) / monthRevenue) * 100).toFixed(1)) : 0,
        revenueTrend: monthlyRevenueTrend.map((r: any) => ({ date: r.date, total: r.total, count: r.count })),
      },
    },
    message: "ok",
  };
}
