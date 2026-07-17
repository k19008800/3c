// ============================================================
//  3cloud (3C) — 用量聚合统计
//  核心聚合逻辑（核心）
// ============================================================

import { eq, and, gte, lt, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { callLogs } from "../../db/schema.js";
import { AggregatedQuery, AggregationItem, AggregatedResult, PeriodGranularity } from "./types.js";
import { CACHE_TTL, LARGE_RANGE_DAYS, getTruncExpr, formatTimeBucket, buildCacheKey } from "./constants.js";

/**
 * 用量聚合查询（核心）
 */
export async function aggregateUsage(
  query: AggregatedQuery,
  extraFilters?: (typeof callLogs)[], // 额外 WHERE 条件
): Promise<AggregatedResult> {
  const {
    start,
    end,
    granularity = "day",
    modelName,
    vendorName,
    userId,
    limit = 365,
  } = query;

  const now = new Date();
  const startDate = start ? new Date(start) : new Date(now.getTime() - 7 * 86400000);
  const endDate = end ? new Date(end) : now;

  // 大时间范围强制降级为天粒度
  const effectiveGranularity: PeriodGranularity =
    granularity === "hour" && (endDate.getTime() - startDate.getTime()) > LARGE_RANGE_DAYS * 86400000
      ? "day"
      : granularity;

  const db = getDb();
  const truncExpr = getTruncExpr(effectiveGranularity);

  // 构建 WHERE 条件
  const conditions = [
    gte(callLogs.createdAt, startDate),
    lt(callLogs.createdAt, endDate),
  ];

  if (modelName) conditions.push(eq(callLogs.modelName, modelName));
  if (vendorName) conditions.push(eq(callLogs.vendorName, vendorName));
  if (userId) conditions.push(eq(callLogs.userId, userId));

  // 尝试缓存（仅当无用户筛选时做缓存，因为 userId 是动态的）
  const useCache = !userId;
  const redis = getRedis();
  let cacheKey = "";
  if (useCache) {
    cacheKey = buildCacheKey("stats:usage:aggregated", {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
      granularity: effectiveGranularity,
      modelName,
      vendorName,
      limit,
    });
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
  }

  // 执行聚合查询
  const rows = await db
    .select({
      timeBucket: sql<string>`${truncExpr}::timestamptz`,
      totalCalls: sql<number>`count(*)::int`,
      successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed' or ${callLogs.status} = 'timeout')::int`,
      promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
      completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      uniqueUsers: sql<number>`count(distinct ${callLogs.userId})::int`,
      uniqueModels: sql<number>`count(distinct ${callLogs.modelName})::int`,
    })
    .from(callLogs)
    .where(and(...conditions))
    .groupBy(truncExpr)
    .orderBy(asc(truncExpr))
    .limit(Math.min(limit, 1000));

  // 格式化输出 & 填满缺失桶（天粒度及以上填满，小时粒度不填）
  const dataMap = new Map<string, AggregationItem>();
  let sumTotalCalls = 0;
  let sumSuccessCalls = 0;
  let sumFailedCalls = 0;
  let sumPromptTokens = 0;
  let sumCompletionTokens = 0;
  let sumTotalTokens = 0;
  let sumTotalCost = 0;
  let sumAvgDuration = 0;
  let countDuration = 0;
  const uniqueUsersSet = new Set<number>();
  const uniqueModelsSet = new Set<string>();

  for (const r of rows) {
    const bucket = formatTimeBucket(r.timeBucket, effectiveGranularity);
    const item: AggregationItem = {
      timeBucket: bucket,
      totalCalls: r.totalCalls,
      successCalls: r.successCalls,
      failedCalls: r.failedCalls,
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      totalTokens: Number(r.totalTokens),
      totalCost: r.totalCost,
      avgDuration: r.avgDuration,
      uniqueUsers: r.uniqueUsers,
      uniqueModels: r.uniqueModels,
    };
    dataMap.set(bucket, item);

    sumTotalCalls += r.totalCalls;
    sumSuccessCalls += r.successCalls;
    sumFailedCalls += r.failedCalls;
    sumPromptTokens += Number(r.promptTokens);
    sumCompletionTokens += Number(r.completionTokens);
    sumTotalTokens += Number(r.totalTokens);
    sumTotalCost += Number(r.totalCost);
    if (r.avgDuration > 0) {
      sumAvgDuration += r.avgDuration;
      countDuration++;
    }
  }

  // 填充空桶（只在天/月粒度）
  const series: AggregationItem[] = [];
  if (effectiveGranularity === "day" || effectiveGranularity === "week" || effectiveGranularity === "month") {
    const cursor = new Date(startDate);
    const stepMs = effectiveGranularity === "month" ? 30 * 86400000 : effectiveGranularity === "week" ? 7 * 86400000 : 86400000;
    while (cursor < endDate) {
      const bucket = cursor.toISOString().slice(0, 10);
      series.push(
        dataMap.get(bucket) ?? {
          timeBucket: bucket,
          totalCalls: 0,
          successCalls: 0,
          failedCalls: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          totalCost: "0",
          avgDuration: 0,
          uniqueUsers: 0,
          uniqueModels: 0,
        },
      );
      cursor.setTime(cursor.getTime() + stepMs);
    }
  } else {
    // 小时粒度：直接输出查询结果
    for (const r of rows) {
      const bucket = formatTimeBucket(r.timeBucket, effectiveGranularity);
      const item = dataMap.get(bucket);
      if (item) series.push(item);
    }
  }

  const result: AggregatedResult = {
    series,
    summary: {
      totalCalls: sumTotalCalls,
      successCalls: sumSuccessCalls,
      failedCalls: sumFailedCalls,
      totalTokens: sumTotalTokens,
      promptTokens: sumPromptTokens,
      completionTokens: sumCompletionTokens,
      totalCost: sumTotalCost.toFixed(6),
      avgDuration: countDuration > 0 ? Math.round(sumAvgDuration / countDuration) : 0,
      uniqueUsers: uniqueUsersSet.size,
      uniqueModels: uniqueModelsSet.size,
    },
  };

  // 写缓存
  if (useCache) {
    redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)).catch(() => {});
  }

  return result;
}
