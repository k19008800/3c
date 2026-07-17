// ============================================================
//  3cloud (3C) — 用量明细查询
//  用户端用量明细（含模型/供应商细分）
// ============================================================

import { eq, and, gte, lt, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs } from "../../db/schema.js";
import { AggregatedQuery, DetailItem } from "./types.js";
import { getTruncExpr, formatTimeBucket } from "./constants.js";

/**
 * 用户端用量明细（含模型/供应商细分）
 */
export async function getUsageDetail(
  userId: number,
  query: AggregatedQuery,
): Promise<{ items: DetailItem[] }> {
  const {
    start,
    end,
    granularity = "day",
    modelName,
    vendorName,
    limit = 100,
  } = query;

  const now = new Date();
  const startDate = start ? new Date(start) : new Date(now.getTime() - 7 * 86400000);
  const endDate = end ? new Date(end) : now;

  const db = getDb();
  const truncExpr = getTruncExpr(granularity);

  const conditions = [
    eq(callLogs.userId, userId),
    gte(callLogs.createdAt, startDate),
    lt(callLogs.createdAt, endDate),
  ];
  if (modelName) conditions.push(eq(callLogs.modelName, modelName));
  if (vendorName) conditions.push(eq(callLogs.vendorName, vendorName));

  const rows = await db
    .select({
      timeBucket: sql<string>`${truncExpr}::timestamptz`,
      modelName: callLogs.modelName,
      vendorName: callLogs.vendorName,
      totalCalls: sql<number>`count(*)::int`,
      successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
    })
    .from(callLogs)
    .where(and(...conditions))
    .groupBy(truncExpr, callLogs.modelName, callLogs.vendorName)
    .orderBy(desc(truncExpr))
    .limit(Math.min(limit, 500));

  const items: DetailItem[] = rows.map((r) => ({
    timeBucket: formatTimeBucket(r.timeBucket, granularity),
    modelName: r.modelName,
    vendorName: r.vendorName,
    totalCalls: r.totalCalls,
    successCalls: r.successCalls,
    totalTokens: Number(r.totalTokens),
    totalCost: r.totalCost,
    avgDuration: r.avgDuration,
  }));

  return { items };
}
