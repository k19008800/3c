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
 * P0 扩展（ARCH 评审 D-13/D-10/D-3/D-4）：本模块同时承载缓存计费模式开关
 * `billing.cache_pricing_mode`（explicit / discount_rate，默认 explicit）的读取与失效——
 * getCachePricingMode / invalidateCachePricingCache 与折扣率同模式（Redis 60s + 即时失效）；
 * 价格解析 resolveCachePricing（P0 生效 4 级，级 1 models 覆盖价缺省 D-10）亦在本文件落地。
 *
 * @see cache-billing.ts（纯计算模块，不依赖 DB/Redis）
 * @see pre-consume.ts（阈值缓存模式参考）
 * @module services/billing
 */

import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheDel } from '../../lib/redis.js';
import { CACHE_HIT_DISCOUNT, type TokenPricing } from './cache-billing.js';
import { DEFAULT_INPUT_PRICE, type ModelPricing } from './pricing.js';

// ============================================================
// 常量
// ============================================================

/** system_config 中全局缓存命中折扣率配置键（默认 0.1） */
export const CACHE_DISCOUNT_CONFIG_KEY = 'billing.cache_hit_discount';

/** 全局折扣率 Redis 缓存键 + TTL（60s，后台修改后即时失效） */
const CACHE_DISCOUNT_CACHE_KEY = 'billing:cache_hit_discount';
const CACHE_DISCOUNT_CACHE_TTL_SECONDS = 60;

/** 缓存计费模式（ARCH 评审 D-13）：explicit = 显式价优先（默认）；discount_rate = 兼容旧折扣率行为（灰度/回退） */
export type CachePricingMode = 'explicit' | 'discount_rate';

/** system_config 中缓存计费模式配置键（默认 explicit） */
export const CACHE_PRICING_MODE_CONFIG_KEY = 'billing.cache_pricing_mode';

/** 模式 Redis 缓存键 + TTL（60s，后台修改后即时失效） */
const CACHE_PRICING_MODE_CACHE_KEY = 'billing:cache_pricing_mode';
const CACHE_PRICING_MODE_CACHE_TTL_SECONDS = 60;

/** 模式缺省值（D-13：存量无显式价模型自动回退折扣率链，行为不变，默认即安全） */
export const DEFAULT_CACHE_PRICING_MODE: CachePricingMode = 'explicit';

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

// ============================================================
// 缓存计费模式（D-13，T1）
// ============================================================

/**
 * 读取缓存计费模式（system_config `billing.cache_pricing_mode`，默认 explicit）
 *
 * Redis 缓存 60s（后台 PUT /admin/settings/billing 后调用 invalidateCachePricingCache 即时生效）；
 * DB/缓存异常或非法值 → 默认 explicit，不阻断主链路（与 getGlobalCacheDiscount 同模式）。
 *
 * @returns 'explicit' | 'discount_rate'
 */
export async function getCachePricingMode(): Promise<CachePricingMode> {
  const cached = await cacheGet(CACHE_PRICING_MODE_CACHE_KEY);
  if (cached === 'explicit' || cached === 'discount_rate') return cached;

  let mode: CachePricingMode = DEFAULT_CACHE_PRICING_MODE;
  let readOk = false; // DB 读取成功才写缓存：DB 异常（含测试 mock）不污染共享缓存
  try {
    const rows = await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, CACHE_PRICING_MODE_CONFIG_KEY))
      .limit(1);
    if (rows.length > 0) {
      const raw = rows[0]!.value;
      if (raw === 'explicit' || raw === 'discount_rate') mode = raw;
    }
    readOk = true;
  } catch {
    /* DB 异常 → 默认值 */
  }

  if (readOk) {
    await cacheSet(CACHE_PRICING_MODE_CACHE_KEY, mode, CACHE_PRICING_MODE_CACHE_TTL_SECONDS);
  }
  return mode;
}

/**
 * 失效缓存计费模式缓存（后台修改 billing.cache_pricing_mode 后调用，判定即时生效）
 */
export async function invalidateCachePricingCache(): Promise<void> {
  await cacheDel(CACHE_PRICING_MODE_CACHE_KEY);
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

// ============================================================
// 缓存价格解析（D-10/D-3/D-4，T3）
// ============================================================

/** 缓存价格解析结果（resolveCachePricing 返回值） */
export interface ResolvedCachePricing {
  /** 生效缓存读取单价（¥ / 1K tokens） */
  cacheReadPrice: number;
  /** 生效缓存写入单价（¥ / 1K tokens）；显式缺失 → 生效 input 全价（D-3 保守口径） */
  cacheWritePrice: number;
  /** 写入价来源标识（D-4）：explicit = 显式写入价；full_price = 生效 input 全价兜底（P0 进 metadata，P2 透出） */
  cacheWritePriceSource: 'explicit' | 'full_price';
  /** 读取价解析来源（审计/展示用） */
  source: 'explicit' | 'discount_rate' | 'global_discount' | 'fallback';
}

/**
 * 解析单次请求生效的缓存读取/写入单价（P0 生效 4 级，ARCH 评审 D-10）
 *
 * 读取价优先级：
 *   级 1  models.override_cache_read_input_price —— models 表不存在，P0 缺省（D-10），
 *            L2 覆盖语义由级 2 default 组显式缓存价列天然承载；
 *   级 2  pricing.cacheReadInputPrice（vendor_pricing.cache_read_input_price，显式）→ source='explicit'
 *   级 3  pricing.cacheDiscountRate（模型级折扣率）→ `生效 input × rate`（D-3）
 *   级 4  system_config billing.cache_hit_discount（全局折扣率）→ `生效 input × rate`
 *   级 5  CACHE_HIT_DISCOUNT（0.1）代码兜底 → `生效 input × 0.1`
 *
 * 写入价（D-3/D-4）：
 *   - explicit 模式：显式 cacheWriteInputPrice（≥0 合法，可为 0 或高于 input —— product Q3 裁定无上限）→ source='explicit'；
 *   - 缺失 → 生效 input 全价 → source='full_price'；
 *   - discount_rate 模式：恒为生效 input 全价（与旧版一致，不读显式写入价）。
 *
 * 生效 input（D-3 语义）：pricing.input 即请求最终生效输入单价（经 L5/L4/L3/L2/L1 后的值），
 * 折扣率回退以该值为基准，而非 L1 原始价。
 *
 * @param pricing - getPricingForModel 返回的定价（含显式缓存价字段；null → 全局/兜底 + 默认 input）
 * @param opts - 可注入 mode/globalRate（测试避免 DB/Redis 依赖；缺省时内部自动读取）
 * @returns 生效缓存读取/写入单价 + 来源标识
 */
export async function resolveCachePricing(
  pricing?: ModelPricing | null,
  opts?: { mode?: CachePricingMode; globalRate?: number },
): Promise<ResolvedCachePricing> {
  const mode = opts?.mode ?? (await getCachePricingMode());
  const isExplicit = mode === 'explicit';

  // D-3：pricing.input 即生效输入单价；非法/缺省（pricing 为 null）→ 默认 L1 单价
  const input = pricing?.input != null && Number.isFinite(pricing.input) && pricing.input > 0
    ? pricing.input
    : DEFAULT_INPUT_PRICE;

  // ── 读取价：explicit 走级 2→3→4→5；discount_rate 强制折扣率链（3→4→5，与旧版一致）──
  let cacheReadPrice: number;
  let source: ResolvedCachePricing['source'];
  const explicitRead = pricing?.cacheReadInputPrice;
  if (isExplicit && explicitRead != null && Number.isFinite(explicitRead) && explicitRead >= 0) {
    cacheReadPrice = explicitRead; // 级 2 显式价（0 = 免费读缓存，合法）
    source = 'explicit';
  } else {
    const perModel = pricing?.cacheDiscountRate;
    if (perModel != null && Number.isFinite(perModel) && perModel > 0 && perModel <= 1) {
      cacheReadPrice = input * perModel; // 级 3 模型级折扣率（D-3：生效 input × rate）
      source = 'discount_rate';
    } else {
      const g = opts?.globalRate != null ? opts.globalRate : await getGlobalCacheDiscount();
      if (Number.isFinite(g) && g > 0 && g <= 1) {
        cacheReadPrice = input * g; // 级 4 全局折扣率
        source = 'global_discount';
      } else {
        cacheReadPrice = input * CACHE_HIT_DISCOUNT; // 级 5 代码兜底
        source = 'fallback';
      }
    }
  }

  // ── 写入价：explicit 显式优先（product Q3 裁定：可为 0 或 > input，无上限校验）；discount_rate 强制全价 ──
  let cacheWritePrice: number;
  let cacheWritePriceSource: ResolvedCachePricing['cacheWritePriceSource'];
  const explicitWrite = pricing?.cacheWriteInputPrice;
  if (isExplicit && explicitWrite != null && Number.isFinite(explicitWrite) && explicitWrite >= 0) {
    cacheWritePrice = explicitWrite;
    cacheWritePriceSource = 'explicit';
  } else {
    cacheWritePrice = input; // 写入价缺失 → 生效 input 全价（D-3）
    cacheWritePriceSource = 'full_price';
  }

  return { cacheReadPrice, cacheWritePrice, cacheWritePriceSource, source };
}
