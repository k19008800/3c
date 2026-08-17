/**
 * 缓存命中打折计费 — 上游返回缓存命中 token 时按折扣价计费
 *
 * 背景（参考 New API「缓存命中打折计费」，见 newapi-gap-analysis.md Batch 3 任务 3.2）：
 * 部分上游在 usage 中返回缓存字段，命中部分应按折扣价计费，而不是一律全价：
 * - Anthropic：cache_read_input_tokens（读取命中，按 10% 价）
 * - DeepSeek：prompt_cache_hit_tokens / prompt_cache_miss_tokens（命中 10% 价）
 * - OpenAI：prompt_tokens_details.cached_tokens（命中 50% 价，统一按 CACHE_HIT_DISCOUNT 配置）
 *
 * 折扣率可配置（见 cache-discount.ts）：
 * - 模型级：vendor_pricing.cache_discount_rate（价格管理后台逐模型配置，覆盖全局）
 * - 全局：system_config `billing.cache_hit_discount`（系统设置 → 计费策略，默认 0.1）
 * - 兜底：CACHE_HIT_DISCOUNT 常量（0.1）
 *
 * 职责：
 * - computeCacheDiscountedCost：给定 input/output token 与缓存命中信息计算折后价
 * - parseAndDiscount：组合 parseCacheTokens + computeCacheDiscountedCost，usage 无缓存信息时返回全价
 *
 * 纯计算模块，不依赖 db / redis / Fastify，便于单测。
 *
 * @see coding-standards-api-db-test.md（纯函数 service 规范）
 * @module services/billing
 */

import { parseCacheTokens, toNonNegativeInt, type CacheTokenInfo } from './usage-parser.js';

// ============================================================
// 常量
// ============================================================

/**
 * 缓存命中折扣率默认值 — 命中 token 按全价的 10% 计费。
 *
 * DeepSeek 官方即按 10% 收取缓存命中费用；OpenAI 官方为 50%，当前统一按保守的 10%
 * （对平台更有利、对用户更优惠）。后续可在后台逐模型覆盖（vendor_pricing.cache_discount_rate）
 * 或全局覆盖（system_config billing.cache_hit_discount）。
 */
export const CACHE_HIT_DISCOUNT = 0.1;

// ============================================================
// Types
// ============================================================

/** 单次计费的单价（¥ / 1K tokens） */
export interface TokenPricing {
  /** 输入单价（¥ / 1K tokens） */
  input: number;
  /** 输出单价（¥ / 1K tokens） */
  output: number;
  /** 模型级缓存命中折扣率（0-1）；未配置/非法为 null/undefined → 用全局配置 */
  cacheDiscountRate?: number | null;
}

/** 缓存打折计费结果 */
export interface CacheBillingResult {
  /** 折后费用（¥） */
  cost: number;
  /** 折扣金额（全价 - 折后价，≥ 0） */
  discountAmount: number;
  /** 参与打折的缓存命中 token 数（已按 input_tokens 上限收敛） */
  cacheHitTokens: number;
  /** 未命中 token 数（input - hit，按全价计费） */
  cacheMissTokens: number;
}

// ============================================================
// 计费计算
// ============================================================

/**
 * 计算缓存命中打折后的费用
 *
 * 计费公式：
 * - 无缓存信息：input × inputPrice + output × outputPrice（全价）
 * - 有缓存命中：
 *   hit × inputPrice × discountRate + (input - hit) × inputPrice + output × outputPrice
 *
 * 防御：cacheHitTokens 超过 inputTokens 时收敛到 inputTokens，避免 (input - hit) 出现负数。
 *
 * @param inputTokens - 输入 token 数（≥ 0）
 * @param outputTokens - 输出 token 数（≥ 0）
 * @param pricing - 单价（¥ / 1K tokens）
 * @param cacheTokens - parseCacheTokens 的归一化结果；null/undefined 或无缓存字段时按全价
 * @param discountRate - 缓存命中折扣率（0-1）；缺省用 CACHE_HIT_DISCOUNT（0.1）
 * @returns 折后费用 + 折扣金额 + 缓存 token 明细
 */
export function computeCacheDiscountedCost(
  inputTokens: number,
  outputTokens: number,
  pricing: TokenPricing,
  cacheTokens: CacheTokenInfo | null | undefined,
  discountRate: number = CACHE_HIT_DISCOUNT,
): CacheBillingResult {
  const fullCost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;

  // 无缓存信息或命中为 0 → 全价，无折扣
  if (!cacheTokens || !cacheTokens.hasCacheInfo || cacheTokens.cacheHitTokens <= 0) {
    return { cost: fullCost, discountAmount: 0, cacheHitTokens: 0, cacheMissTokens: 0 };
  }

  // 命中数防御性收敛到输入上限，避免 (input - hit) 为负导致费用低于输出成本
  const hit = Math.min(cacheTokens.cacheHitTokens, inputTokens);
  const miss = inputTokens - hit;

  const discountedCost =
    (hit / 1000) * pricing.input * discountRate +
    (miss / 1000) * pricing.input +
    (outputTokens / 1000) * pricing.output;

  return {
    cost: discountedCost,
    discountAmount: fullCost - discountedCost,
    cacheHitTokens: hit,
    cacheMissTokens: miss,
  };
}

/**
 * 组合函数：从 usage 提取缓存字段并计算打折费用
 *
 * 规则：
 * - usage 存在且有缓存命中字段 → 命中部分按 discountRate 打折
 * - usage 无缓存字段 → 与旧 computeCost 完全一致（全价，回归安全）
 * - usage 为 null/undefined → 视为 0 token 全价（cost = 0）
 *
 * @param usage - 非流式响应 body 中的 usage 对象（可为 null/undefined）
 * @param pricing - 单价（¥ / 1K tokens）
 * @param discountRate - 缓存命中折扣率（0-1）；缺省用 CACHE_HIT_DISCOUNT（0.1）
 * @returns CacheBillingResult（含 cost / discountAmount / 缓存 token 明细）
 */
export function parseAndDiscount(
  usage: unknown,
  pricing: TokenPricing,
  discountRate: number = CACHE_HIT_DISCOUNT,
): CacheBillingResult {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>;
  const inputTokens = toNonNegativeInt(u.prompt_tokens);
  const outputTokens = toNonNegativeInt(u.completion_tokens);
  return computeCacheDiscountedCost(inputTokens, outputTokens, pricing, parseCacheTokens(usage), discountRate);
}
