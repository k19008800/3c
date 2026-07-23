// @ts-nocheck
// ============================================================
//  3cloud (3C) — COUNT(*) 查询优化工具
//  针对大表 COUNT(*) 的性能优化：
//  1. 估算计数：对于大表（>10 万行），使用 PostgreSQL pg_stat_user_tables.n_live_tup 估算
//  2. Redis 缓存：缓存精确 COUNT 结果，TTL 60s
//  3. 智能选择：根据表大小自动选择估算或缓存
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import type { InferSelectModel } from "drizzle-orm";

// Redis 键前缀
const COUNT_CACHE_PREFIX = "count:";

// 缓存 TTL（秒）
const CACHE_TTL = 60;

// 大表阈值（行数）
const LARGE_TABLE_THRESHOLD = 100000;

/**
 * 获取 PostgreSQL 统计信息中的估算行数
 * @param tableName 表名（不带 schema）
 * @returns 估算的行数，如果表不存在则返回 0
 */
export async function getEstimatedCount(tableName: string): Promise<number> {
  try {
    const db = getDb();
    const [result] = await db.execute<{ n_live_tup: number }>(
      sql`SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = ${tableName}`
    );
    return result?.n_live_tup || 0;
  } catch (error) {
    console.warn(`[count-optimizer] Failed to get estimated count for table ${tableName}:`, error);
    return 0;
  }
}

/**
 * 获取缓存的计数，如果缓存不存在则执行查询并缓存
 * @param cacheKey 缓存键（建议使用表名+过滤条件）
 * @param queryFn 查询函数，返回精确的行数
 * @returns 行数（来自缓存或查询）
 */
export async function getCachedCount(
  cacheKey: string,
  queryFn: () => Promise<number>
): Promise<number> {
  try {
    const redis = getRedis();
    const cached = await redis.get(`${COUNT_CACHE_PREFIX}${cacheKey}`);
    
    if (cached) {
      const count = parseInt(cached, 10);
      if (!isNaN(count)) {
        return count;
      }
    }
    
    // 缓存未命中，执行查询
    const count = await queryFn();
    
    // 缓存结果
    await redis.set(`${COUNT_CACHE_PREFIX}${cacheKey}`, count.toString(), "EX", CACHE_TTL);
    
    return count;
  } catch (error) {
    console.warn(`[count-optimizer] Cache error for key ${cacheKey}:`, error);
    // 缓存失败时直接执行查询
    return await queryFn();
  }
}

/**
 * 智能计数：根据表大小选择估算或缓存精确值
 * @param tableName 表名
 * @param exactQuery 精确查询函数
 * @param forceExact 是否强制使用精确计数
 * @returns 行数
 */
export async function getSmartCount(
  tableName: string,
  exactQuery: () => Promise<number>,
  forceExact: boolean = false
): Promise<number> {
  if (forceExact) {
    // 强制使用精确计数
    return await exactQuery();
  }
  
  try {
    const estimated = await getEstimatedCount(tableName);
    
    if (estimated > LARGE_TABLE_THRESHOLD) {
      // 大表使用估算值（误差可接受）
      return estimated;
    } else {
      // 小表使用缓存精确值
      return await getCachedCount(tableName, exactQuery);
    }
  } catch (error) {
    console.warn(`[count-optimizer] Smart count failed for table ${tableName}:`, error);
    // 降级到精确查询
    return await exactQuery();
  }
}

/**
 * 创建带过滤条件的缓存键
 * @param tableName 表名
 * @param filters 过滤条件（对象）
 * @returns 缓存键字符串
 */
export function buildCacheKey(tableName: string, filters?: Record<string, any>): string {
  if (!filters || Object.keys(filters).length === 0) {
    return tableName;
  }
  
  // 对过滤器排序以保证相同的过滤条件生成相同的键
  const sortedFilters = Object.keys(filters)
    .sort()
    .map(key => `${key}:${JSON.stringify(filters[key])}`)
    .join('|');
  
  return `${tableName}:${sortedFilters}`;
}

/**
 * 批量清理计数缓存
 * @param patterns 缓存键模式数组
 */
export async function clearCountCache(patterns: string[]): Promise<void> {
  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    
    for (const pattern of patterns) {
      pipeline.del(`${COUNT_CACHE_PREFIX}${pattern}`);
    }
    
    await pipeline.exec();
  } catch (error) {
    console.warn("[count-optimizer] Failed to clear count cache:", error);
  }
}

/**
 * 专门用于分页查询的智能计数
 * @param tableName 表名
 * @param countQuery 原始的 COUNT(*) SQL 查询
 * @param filters 过滤条件（用于构建缓存键）
 * @returns 智能行数
 */
export async function getPaginationCount(
  tableName: string,
  countQuery: () => Promise<number>,
  filters?: Record<string, any>
): Promise<number> {
  const cacheKey = buildCacheKey(tableName, filters);
  return await getSmartCount(tableName, countQuery);
}

// 导出常用大表名常量
export const LARGE_TABLES = {
  CALL_LOGS: "call_logs",
  BALANCE_LOGS: "balance_logs",
  COMMISSION_LOGS: "commission_logs",
  AUDIT_LOGS: "audit_logs",
  OPERATION_LOGS: "operation_logs",
} as const;