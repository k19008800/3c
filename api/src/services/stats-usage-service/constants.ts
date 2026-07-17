// ============================================================
//  3cloud (3C) — 用量聚合统计 常量 & 辅助
// ============================================================

import { sql } from "drizzle-orm";
import { callLogs } from "../../db/schema.js";
import { PeriodGranularity } from "./types.js";

/** 5分钟缓存 */
export const CACHE_TTL = 300;

/**
 * 大时间范围阈值（31天），超过此阈值强制按天聚合
 */
export const LARGE_RANGE_DAYS = 31;

/**
 * 根据粒度获取 SQL date_trunc 表达式
 */
export function getTruncExpr(granularity: PeriodGranularity) {
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
export function formatTimeBucket(raw: Date | string, granularity: PeriodGranularity): string {
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (granularity === "hour") {
    return d.toISOString().slice(0, 13) + ":00:00.000Z";
  }
  return d.toISOString().slice(0, 10);
}

/**
 * 构建缓存 key
 */
export function buildCacheKey(prefix: string, params: Record<string, any>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  return `${prefix}:${parts.join(":")}`;
}
