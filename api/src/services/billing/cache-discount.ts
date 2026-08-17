/**
 * 缓存命中折扣率配置解析 — 模型级优先，回退全局，最后兜底默认常量
 *
 * 层级（优先级从高到低）：
 * 1. 模型级：vendor_pricing.cache_discount_rate（价格管理后台逐模型配置）
 * 2. 全局：system_config `billing.cache_hit_discount`（系统设置 → 计费策略，默认 0.1）
 * 3. 兜底：cache-billing.ts CACHE_HIT_DISCOUNT（0.1）
 *
 * 全局读取带 Redis 缓存（60s），后台修改 billing.cache_hit_discount 后
 * 调用 invalidateCacheDiscountCache 即时失效（与 pre-consume 阈值缓存同模式）。
 *
 * @see cache-billing.ts（纯计算模块，不依赖 DB/Redis）
 * @see pre-consume.ts（阈值缓存模式参考）
 * @module services/billing
 */

import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheDel } from '../../lib/redis';
import { CACHE_HIT_DISCOUNT, type TokenPricing } from './cache-billing';

// ============================================================
// 常量
// ============================================================

/** system_config 中全局缓存命中折扣率配置键（默认 0.1） */
export const CACHE_DISCOUNT_CONFIG_KEY = 'billing.cache_hit_discount';

/** 全局折扣率 Redis 缓存键 + TTL（60s，后台修改后即时失效） */
const CACHE_DISCOUNT_CACHE_KEY = 'billing:cache_hit_discount';
const CACHE_DISCOUNT_CACHE_TTL_SECONDS = 60;

// ============================================================
// 全局配置读取
// ============================================================

/**
 * 读取全局缓存命中折扣率（system_config `billing.cache_hit_discount`，默认 0.1）
 *
 * Redis 缓存 60s（后台 PUT /admin/settings/billing 后调用 invalidateCacheDiscountCache 即时生效）；
 * DB/缓存异常 → 默认值，不阻断主链路。
 *
 * @returns 折扣率（0-1）
 */
export async function getGlobalCacheDiscount(): Promise<number> {
  const cached = await cacheGet(CACHE_DISCOUNT_CACHE_KEY);
  if (cached != null) {
    const n = Number(cached);
    if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  }

  let rate = CACHE_HIT_DISCOUNT;
  let readOk = false; // DB 读取成功才写缓存：DB 异常（含测试 mock）不污染共享缓存
  try {
    const rows = await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, CACHE_DISCOUNT_CONFIG_KEY))
      .limit(1);
    if (rows.length > 0) {
      const n = Number(rows[0]!.value);
      if (Number.isFinite(n) && n > 0 && n <= 1) rate = n;
    }
    readOk = true;
  } catch {
    /* DB 异常 → 默认值 */
  }

  if (readOk) {
    await cacheSet(CACHE_DISCOUNT_CACHE_KEY, String(rate), CACHE_DISCOUNT_CACHE_TTL_SECONDS);
  }
  return rate;
}

/**
 * 失效全局折扣率缓存（后台修改 billing.cache_hit_discount 后调用，判定即时生效）
 */
export async function invalidateCacheDiscountCache(): Promise<void> {
  await cacheDel(CACHE_DISCOUNT_CACHE_KEY);
}

/**
 * 解析单次请求生效的缓存命中折扣率
 *
 * 优先级：模型级（pricing.cacheDiscountRate）→ 全局配置 → 默认常量。
 * 模型级配置非法（≤0 或 >1）时忽略，回退全局/默认。
 *
 * @param pricing - getPricingForModel 返回的定价（含模型级 cacheDiscountRate）
 * @param globalRate - 可选注入的全局折扣率；缺省时自动读取（测试可传固定值避免依赖 DB/Redis）
 * @returns 生效折扣率（0-1）
 */
export async function resolveCacheDiscountRate(
  pricing?: TokenPricing | null,
  globalRate?: number,
): Promise<number> {
  const perModel = pricing?.cacheDiscountRate;
  if (perModel != null && Number.isFinite(perModel) && perModel > 0 && perModel <= 1) {
    return perModel;
  }
  const g = globalRate != null ? globalRate : await getGlobalCacheDiscount();
  if (Number.isFinite(g) && g > 0 && g <= 1) {
    return g;
  }
  return CACHE_HIT_DISCOUNT;
}
