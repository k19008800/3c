// ============================================================
//  3cloud (3C) — 管理后台用量汇总
//  跨用户聚合 + 模型/供应商维度 breakdown
// ============================================================

import { eq, and, gte, lt, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs } from "../../db/schema.js";
import { AggregatedQuery, AggregationItem } from "./types.js";
import { aggregateUsage } from "./aggregate.js";

/**
 * 管理后台用量汇总（跨用户）
 */
export async function getAdminUsageSummary(
  query: AggregatedQuery,
): Promise<AggregatedResult & { modelBreakdown?: AggregationItem[]; vendorBreakdown?: AggregationItem[] }> {
  const aggregated = await aggregateUsage(query);

  // 额外：按模型维度聚合（给管理后台图表用）
  const db = getDb();
  const {
    start,
    end,
    modelName,
    vendorName,
  } = query;

  const now = new Date();
  const startDate = start ? new Date(start) : new Date(now.getTime() - 7 * 86400000);
  const endDate = end ? new Date(end) : now;

  const conditions = [
    gte(callLogs.createdAt, startDate),
    lt(callLogs.createdAt, endDate),
  ];
  if (modelName) conditions.push(eq(callLogs.modelName, modelName));
  if (vendorName) conditions.push(eq(callLogs.vendorName, vendorName));

  // 按模型统计
  const modelRows = await db
    .select({
      dimension: callLogs.modelName,
      totalCalls: sql<number>`count(*)::int`,
      successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
    })
    .from(callLogs)
    .where(and(...conditions, sql`${callLogs.modelName} IS NOT NULL`))
    .groupBy(callLogs.modelName)
    .orderBy(desc(sql`count(*)::int`))
    .limit(20);

  // 按供应商统计
  const vendorRows = await db
    .select({
      dimension: callLogs.vendorName,
      totalCalls: sql<number>`count(*)::int`,
      successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
    })
    .from(callLogs)
    .where(and(...conditions, sql`${callLogs.vendorName} IS NOT NULL`))
    .groupBy(callLogs.vendorName)
    .orderBy(desc(sql`count(*)::int`))
    .limit(20);

  // 统一的模型/供应商维度 breakdown
  const modelBreakdown: any[] = modelRows.map((r) => ({
    name: r.dimension,
    ...r,
  }));
  const vendorBreakdown: any[] = vendorRows.map((r) => ({
    name: r.dimension,
    ...r,
  }));

  return {
    ...aggregated,
    modelBreakdown,
    vendorBreakdown,
  };
}
