// ============================================================
//  3cloud (3C) — 用量聚合统计 Service
//  核心聚合逻辑：按模型/供应商/时间维度聚合 Token 使用量
//  支持多时间粒度（小时/天/周/月）+ Redis 缓存 5 分钟
// ============================================================

import { eq, and, gte, lt, lte, sql, inArray, asc, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { callLogs } from "../db/schema.js";

// ──────────────────────────────────────────────
//  类型定义
// ──────────────────────────────────────────────

export type PeriodGranularity = "hour" | "day" | "week" | "month";

export interface AggregatedQuery {
  /** 开始时间 ISO 字符串 */
  start?: string;
  /** 结束时间 ISO 字符串 */
  end?: string;
  /** 聚合粒度: hour/day/week/month (默认 day) */
  granularity?: PeriodGranularity;
  /** 按模型名筛选 */
  modelName?: string;
  /** 按供应商筛选 */
  vendorName?: string;
  /** 按用户 ID 筛选（管理后台用） */
  userId?: number;
  /** 最大返回条数 */
  limit?: number;
}

export interface AggregationItem {
  /** 聚合时间桶（ISO 日期/小时） */
  timeBucket: string;
  /** 调用总次数 */
  totalCalls: number;
  /** 成功调用次数 */
  successCalls: number;
  /** 失败调用次数 */
  failedCalls: number;
  /** prompt tokens */
  promptTokens: number;
  /** completion tokens */
  completionTokens: number;
  /** 总 tokens */
  totalTokens: number;
  /** 总成本（字符串，避免精度丢失） */
  totalCost: string;
  /** 平均延迟毫秒 */
  avgDuration: number;
  /** 活跃用户数 */
  uniqueUsers: number;
  /** 活跃模型数 */
  uniqueModels: number;
}

export interface AggregatedResult {
  series: AggregationItem[];
  summary: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: string;
    avgDuration: number;
    uniqueUsers: number;
    uniqueModels: number;
  };
}

export interface DetailItem {
  timeBucket: string;
  modelName: string | null;
  vendorName: string | null;
  totalCalls: number;
  successCalls: number;
  totalTokens: number;
  totalCost: string;
  avgDuration: number;
}

// ──────────────────────────────────────────────
//  常量 & 辅助
// ──────────────────────────────────────────────

const CACHE_TTL = 300; // 5分钟缓存

/**
 * 大时间范围阈值（31天），超过此阈值强制按天聚合
 */
const LARGE_RANGE_DAYS = 31;

/**
 * 根据粒度获取 SQL date_trunc 表达式
 */
function getTruncExpr(granularity: PeriodGranularity) {
  switch (granularity) {
    case "hour":
      return sql`date_trunc('hour', ${callLogs.createdAt})`;
    case "day":
      return sql`date_trunc('day', ${callLogs.createdAt})`;
    case "week":
      return sql`date_trunc('week', ${callLogs.createdAt})`;
    case "month":
      return sql`date_trunc('month', ${callLogs.createdAt})`;
  }
}

/**
 * 格式化时间桶为 ISO 字符串
 */
function formatTimeBucket(raw: Date | string, granularity: PeriodGranularity): string {
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (granularity === "hour") {
    return d.toISOString().slice(0, 13) + ":00:00.000Z";
  }
  return d.toISOString().slice(0, 10);
}

/**
 * 构建缓存 key
 */
function buildCacheKey(prefix: string, params: Record<string, any>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  return `${prefix}:${parts.join(":")}`;
}

// ──────────────────────────────────────────────
//  1. 用量聚合查询（核心）
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  2. 用户端用量明细（含模型/供应商细分）
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  3. 管理后台用量汇总（跨用户）
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  4. 代理端用量（按其名下客户聚合）
// ──────────────────────────────────────────────

export async function getAgentUsageSummary(
  agentUserId: number,
  query: AggregatedQuery,
): Promise<{
  series: AggregationItem[];
  summary: AggregatedResult["summary"];
  clientBreakdown: Array<{ userId: number; totalCalls: number; totalTokens: number; totalCost: string }>;
}> {
  // 获取代理的客户列表
  const { getAgentClients } = await import("./agent-core.js");
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
