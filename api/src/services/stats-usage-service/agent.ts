// ============================================================
//  3cloud (3C) — 代理端用量统计
//  按其名下客户聚合
// ============================================================

import { eq, and, gte, lt, inArray, asc, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs } from "../../db/schema.js";
import { AggregatedQuery, AggregationItem, AggregatedResult, PeriodGranularity } from "./types.js";
import { LARGE_RANGE_DAYS, getTruncExpr, formatTimeBucket } from "./constants.js";

/**
 * 代理端用量（按其名下客户聚合）
 */
export async function getAgentUsageSummary(
  agentUserId: number,
  query: AggregatedQuery,
): Promise<{
  series: AggregationItem[];
  summary: AggregatedResult["summary"];
  clientBreakdown: Array<{ userId: number; totalCalls: number; totalTokens: number; totalCost: string }>;
}> {
  // 获取代理的客户列表
  const { getAgentClients } = await import("../agent-core.js");
  const clients = await getAgentClients(agentUserId, 1, 500);
  const clientUserIds = (clients?.list ?? []).map((c: any) => c.id);

  if (clientUserIds.length === 0) {
    return {
      series: [],
      summary: {
        totalCalls: 0, successCalls: 0, failedCalls: 0,
        totalTokens: 0, promptTokens: 0, completionTokens: 0,
        totalCost: "0", avgDuration: 0,
        uniqueUsers: 0, uniqueModels: 0,
      },
      clientBreakdown: [],
    };
  }

  const {
    start,
    end,
    granularity = "day",
    modelName,
    vendorName,
    limit = 365,
  } = query;

  const now = new Date();
  const startDate = start ? new Date(start) : new Date(now.getTime() - 30 * 86400000);
  const endDate = end ? new Date(end) : now;

  const effectiveGranularity: PeriodGranularity =
    granularity === "hour" && (endDate.getTime() - startDate.getTime()) > LARGE_RANGE_DAYS * 86400000
      ? "day"
      : granularity;

  const db = getDb();
  const truncExpr = getTruncExpr(effectiveGranularity);

  const conditions: any[] = [
    inArray(callLogs.userId, clientUserIds),
    gte(callLogs.createdAt, startDate),
    lt(callLogs.createdAt, endDate),
  ];
  if (modelName) conditions.push(eq(callLogs.modelName, modelName));
  if (vendorName) conditions.push(eq(callLogs.vendorName, vendorName));

  // 时间序列
  const rows = await db
    .select({
      timeBucket: sql<string>`${truncExpr}::timestamptz`,
      totalCalls: sql<number>`count(*)::int`,
      successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
    })
    .from(callLogs)
    .where(and(...conditions))
    .groupBy(truncExpr)
    .orderBy(asc(truncExpr))
    .limit(Math.min(limit, 1000));

  // 客户端细分
  const clientRows = await db
    .select({
      userId: callLogs.userId,
      totalCalls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
    })
    .from(callLogs)
    .where(and(...conditions))
    .groupBy(callLogs.userId)
    .orderBy(desc(sql`count(*)::int`))
    .limit(50);

  const series: AggregationItem[] = rows.map((r) => ({
    timeBucket: formatTimeBucket(r.timeBucket, effectiveGranularity),
    totalCalls: r.totalCalls,
    successCalls: r.successCalls,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: Number(r.totalTokens),
    totalCost: r.totalCost,
    avgDuration: r.avgDuration,
    uniqueUsers: r.uniqueUsers,
    uniqueModels: 0,
  }));

  const summary = series.reduce(
    (acc, s) => ({
      totalCalls: acc.totalCalls + s.totalCalls,
      successCalls: acc.successCalls + s.successCalls,
      failedCalls: 0,
      totalTokens: acc.totalTokens + s.totalTokens,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: (Number(acc.totalCost) + Number(s.totalCost)).toFixed(6),
      avgDuration: Math.max(acc.avgDuration, s.avgDuration),
      uniqueUsers: Math.max(acc.uniqueUsers, s.uniqueUsers),
      uniqueModels: 0,
    }),
    { totalCalls: 0, successCalls: 0, failedCalls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, totalCost: "0", avgDuration: 0, uniqueUsers: 0, uniqueModels: 0 },
  );

  return {
    series,
    summary,
    clientBreakdown: clientRows.map((r) => ({
      userId: r.userId,
      totalCalls: r.totalCalls,
      totalTokens: Number(r.totalTokens),
      totalCost: r.totalCost,
    })),
  };
}
