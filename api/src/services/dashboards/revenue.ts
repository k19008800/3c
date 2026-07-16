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

const REVENUE_CACHE_KEY = "service:dashboard:revenue";
const REVENUE_CACHE_TTL = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildRevenue(db: any, redis: Redis): Promise<RevenueAnalysisResult> {
  // PERF: Redis cache check first (120s TTL)
  try {
    const cached = await redis.get(REVENUE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // PERF: 并行执行所有独立查询
  const [
    revenueByTypeJoined, // PERF: 改为 LEFT JOIN models 在 SQL 端完成分组，避免全量拉取 models 表
    channelRevenue,
    combinedMonthResult, // PERF: 合并 monthCallCost + monthlyRevenueTrend 为一次查询（窗口函数）
  ] = await Promise.all([

    // PERF: revenueByType 改为 LEFT JOIN models，SQL 端直接按 m.type 分组
    //       之前：先查 call_logs 按 modelName 分组，再全量拉取 models 在 JS 侧分组
    //       现在：LEFT JOIN models 直接在 SQL 完成类型分组
    db.execute(sql`
      SELECT
        COALESCE(m.type, 'chat') AS type,
        coalesce(sum(cl.cost::numeric), 0) AS cost,
        coalesce(sum(cl.total_tokens), 0)::bigint AS tokens,
        count(*)::int AS count,
        json_agg(DISTINCT cl.model_name) FILTER (WHERE cl.model_name IS NOT NULL) AS models
      FROM call_logs cl
      LEFT JOIN models m ON cl.model_name = m.name
      WHERE cl.created_at >= ${todayStart} AND cl.created_at < ${todayEnd}
      GROUP BY COALESCE(m.type, 'chat')
      ORDER BY sum(cl.cost::numeric) DESC
    `),

    // 今日支付渠道分布
    db.select({
      channel: rechargeOrders.channel,
      total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    }).from(rechargeOrders)
      .where(and(gte(rechargeOrders.createdAt, todayStart), lt(rechargeOrders.createdAt, todayEnd), eq(rechargeOrders.status, "paid")))
      .groupBy(rechargeOrders.channel),

    // PERF: 合并 monthCallCost + monthlyRevenueTrend 为一次查询
    //       使用 PG window function 在同一查询中同时返回每日趋势和月累计值
    db.execute(sql`
      WITH month_recharge AS (
        SELECT created_at::date AS day, amount::numeric AS amt
        FROM recharge_orders
        WHERE created_at >= ${monthStart} AND created_at < ${todayEnd}
          AND status = 'paid'
      ),
      month_cost AS (
        SELECT cost::numeric AS cost_amt
        FROM call_logs
        WHERE created_at >= ${monthStart} AND created_at < ${todayEnd}
      )
      SELECT
        COALESCE((SELECT sum(amt) FROM month_recharge), 0) AS month_revenue,
        COALESCE((SELECT sum(cost_amt) FROM month_cost), 0) AS month_cost,
        COALESCE((
          SELECT json_agg(daily.* ORDER BY daily.date ASC) FROM (
            SELECT
              day::text AS date,
              sum(amt) AS total,
              count(*)::int AS count
            FROM month_recharge
            GROUP BY day
          ) daily
        ), '[]'::json) AS revenue_trend
    `),
  ]);

  // PERF: Parse combined month result
  const monthRow = combinedMonthResult.rows?.[0] ?? {};
  const monthRevenue = Number(monthRow.month_revenue ?? 0);
  const monthCostVal = Number(monthRow.month_cost ?? 0);

  // Parse JSON revenue_trend
  let monthlyRevenueTrend: Array<{ date: string; total: string; count: number }> = [];
  const trendRaw = monthRow.revenue_trend;
  if (trendRaw) {
    const arr = typeof trendRaw === "string" ? JSON.parse(trendRaw) : trendRaw;
    if (Array.isArray(arr)) {
      monthlyRevenueTrend = arr.map((r: any) => ({
        date: String(r.date ?? r.day ?? ""),
        total: String(r.total ?? "0"),
        count: Number(r.count ?? 0),
      }));
    }
  }

  // PERF: Parse revenueByType from raw SQL result
  const byType: Array<{ type: string; cost: string; tokens: number; count: number; models: string[] }> = [];
  if (revenueByTypeJoined.rows) {
    for (const row of revenueByTypeJoined.rows as any[]) {
      let modelsList: string[] = [];
      if (row.models) {
        modelsList = typeof row.models === "string" ? JSON.parse(row.models) : row.models;
        if (!Array.isArray(modelsList)) modelsList = [];
      }
      byType.push({
        type: row.type ?? "chat",
        cost: Number(row.cost ?? 0).toFixed(6),
        tokens: Number(row.tokens ?? 0),
        count: Number(row.count ?? 0),
        models: modelsList,
      });
    }
  }

  return {
    code: 0,
    data: {
      today: {
        byType,
        byChannel: channelRevenue.map((r: any) => ({
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
        revenueTrend: monthlyRevenueTrend,
      },
    },
    message: "ok",
  };
}

// PERF 缓存导出 — 路由层可直接调用此方法 + 检查内部缓存
export { REVENUE_CACHE_KEY, REVENUE_CACHE_TTL };
