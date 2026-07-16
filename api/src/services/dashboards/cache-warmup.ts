// ============================================================
//  3cloud (3C) — Dashboard Cache Warmup Service
//  应用启动时异步预填缓存，避免冷启动时大量聚合查询
// ============================================================

import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { buildStats } from "./stats.js";
import { buildRevenue } from "./revenue.js";
import { buildTopConsumers } from "./consumers.js";

// PERF: 预热延迟时间（毫秒）
const WARMUP_DELAY_MS = 5000;

/**
 * 预热 Dashboard 缓存
 * 应用启动时异步调用，避免缓存冷启动时第一个用户触发 14+ 聚合查询
 * 使用 setTimeout 延迟执行，不阻塞应用启动
 *
 * 预热顺序（按访问频率）:
 *   1. stats — 最常用（首页仪表盘）
 *   2. revenue — 次常用（营收分析）
 *   3. top-consumers — 消费排行
 *
 * 每个预热有独立 try/catch，单个失败不影响其他
 */
export function scheduleCacheWarmup(): void {
  setTimeout(async () => {
    const logPrefix = "[CacheWarmup]";
    // eslint-disable-next-line no-console
    console.log(`${logPrefix} Starting dashboard cache warmup (delay=${WARMUP_DELAY_MS}ms)`);

    let db;
    let redis;
    try {
      db = getDb();
      redis = getRedis();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${logPrefix} Failed to get db/redis instance, aborting warmup:`, (err as Error).message);
      return;
    }

    // 1. 预热 stats 缓存（最常用 — 首页仪表盘）
    try {
      // PERF: buildStats 内部会检查缓存 → 读到空缓存 → 执行聚合 → 写入缓存（TTL=120s）
      const result = await buildStats(db, redis);
      // eslint-disable-next-line no-console
      console.log(`${logPrefix} Stats cache warmed — users=${result.data.users.total}, todayCalls=${result.data.calls.today.total}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${logPrefix} Stats warmup failed:`, (err as Error).message);
    }

    // 2. 预热 revenue 缓存（次常用 — 营收分析）
    try {
      // PERF: buildRevenue 内部会检查/写入缓存（TTL=120s）
      const result = await buildRevenue(db, redis);
      // eslint-disable-next-line no-console
      console.log(`${logPrefix} Revenue cache warmed — monthRevenue=${result.data.month.revenue}, typeCount=${result.data.today.byType.length}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${logPrefix} Revenue warmup failed:`, (err as Error).message);
    }

    // 3. 预热 top-consumers 缓存（消费排行）
    try {
      // PERF: buildTopConsumers 内部会检查/写入缓存（TTL=120s）
      const result = await buildTopConsumers(db, redis);
      // eslint-disable-next-line no-console
      console.log(`${logPrefix} Top-consumers cache warmed — top=${result.data.topConsumers.length}, lowBalance=${result.data.lowBalanceCount}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${logPrefix} Top-consumers warmup failed:`, (err as Error).message);
    }

    // eslint-disable-next-line no-console
    console.log(`${logPrefix} Dashboard cache warmup complete`);
  }, WARMUP_DELAY_MS);
}
