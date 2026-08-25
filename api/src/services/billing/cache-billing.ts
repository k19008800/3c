/**
 * 缓存计费引擎 — 折扣率兼容层 + 显式价双轨（P0，ARCH 评审 D-1/D-3/D-10/D-11/D-13）
 *
 * 背景（参考 New API「缓存命中打折计费」，见 newapi-gap-analysis.md Batch 3 任务 3.2）：
 * 部分上游在 usage 中返回缓存字段，命中部分应按缓存价计费，而不是一律全价：
 * - Anthropic：cache_read_input_tokens（读取命中）+ cache_creation_input_tokens（写入缓存，独立计价）
 * - DeepSeek：prompt_cache_hit_tokens / prompt_cache_miss_tokens
 * - OpenAI：prompt_tokens_details.cached_tokens
 *
 * 双轨制（方案 §三 / ARCH 附录一致性声明）：
 * - 显式价（权威计费依据）：computeCacheCost / computeUsageCost —— 读取价按 4 级解析（D-10），
 *   写入价显式优先、缺失按生效 input 全价（D-3）；`cache_pricing_mode=explicit`（默认，D-13）。
 * - 折扣率（兼容/快捷）：computeCacheDiscountedCost / parseAndDiscount —— `discount_rate` 模式
 *   回退旧行为（读取按折扣率、写入按全价），金额与旧版完全一致（R-B5 对照断言覆盖）。
 *
 * 精度（D-1）：金额输出对齐 numeric(18,8)/toFixed(8) 写库口径（settle 链路 cost.toFixed(8)）；
 * 计算返回 number，8 位小数由断言/写库 toFixed(8) 保证。
 *
 * 纯计算模块（computeCacheCost/computeCacheDiscountedCost/parseAndDiscount 不依赖 db/redis/Fastify）；
 * computeUsageCost 为 async 统一入口（内部解析模式与价格，可注入避免 DB/Redis 依赖）。
 *
 * @see coding-standards-api-db-test.md（纯函数 service 规范）
 * @see docs/P0-缓存定价与缓存计量-开发任务书.md v2.0 §4
 * @module services/billing
 */

import { parseCacheTokens, toNonNegativeInt, type CacheTokenInfo } from './usage-parser.js';
import {
  getCachePricingMode,
  resolveCacheDiscountRate,
  resolveCachePricing,
  type CachePricingMode,
} from './cache-discount.js';
import type { ModelPricing } from './pricing.js';
import { DEFAULT_INPUT_PRICE, DEFAULT_OUTPUT_PRICE } from './pricing.js';

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

/**
 * 流式 usage 注入开关（ARCH 评审 R-B4 / D-9 风险缓释）。
 *
 * 注入逻辑集中在各路由 `buildUpstreamBody` 单点：`stream=true` 时补
 * `stream_options: { include_usage: true }`（chat / messages / openai-compat 三端点；
 * responses 已有、anthropic 天然携带）。
 * P0 以常量实现：上游兼容问题可改 false 全局快速关闭；后续可升级为
 * system_config key `billing.stream_cache_usage_enabled`（本期不落 key，仅预留）。
 */
export const STREAM_INCLUDE_USAGE_ENABLED = true;

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

// ============================================================
// 显式价计费（P0 双轨制权威路径，D-1/D-3/D-10/D-11）
// ============================================================

/** 显式价计费入参定价（TokenPricing + 显式缓存价字段；ModelPricing 结构兼容） */
export interface ExplicitTokenPricing extends TokenPricing {
  /** 显式缓存读取售价（¥ / 1K；未配置 null → 回退折扣率/全局/兜底） */
  cacheReadInputPrice?: number | null;
  /** 显式缓存写入售价（¥ / 1K；未配置 null → 写入按生效 input 全价） */
  cacheWriteInputPrice?: number | null;
}

/** 显式价计费结果（computeCacheCost / computeUsageCost 返回值） */
export interface CacheCostResult extends CacheBillingResult {
  /** 缓存写入 token 数（已按 D-11 收敛） */
  cacheWriteTokens: number;
  /** 缓存读取计费金额（¥，8 位小数写库口径） */
  cacheHitCost: number;
  /** 缓存写入计费金额（¥） */
  cacheWriteCost: number;
  /** 写入价来源标识（D-4）：explicit / full_price；discount_rate 模式恒 'full_price' */
  cacheWritePriceSource?: 'explicit' | 'full_price';
  /** 本次调用实际采用的缓存读取单价快照（¥/1K，D-8 定价快照列，审计/对账口径） */
  cacheReadPrice: number;
  /** 本次调用实际采用的缓存写入单价快照（¥/1K；显式缺失时 = 生效 input 全价） */
  cacheWritePrice: number;
}

/**
 * 显式价计费（方案 §6 公式，D-1/D-3/D-10/D-11）
 *
 * 公式：
 *   输入费用 = cacheRead × cacheReadPrice + cacheWrite × cacheWritePrice
 *             + (prompt − cacheRead − cacheWrite) × inputPrice
 *   输出费用 = completion × outputPrice
 *   cacheHitCost = cacheRead × cacheReadPrice；cacheWriteCost = cacheWrite × cacheWritePrice
 *   discountAmount = 全价（全部按 input/output 价）− 实际费用
 *
 * 语义要点：
 * - 收敛（D-11，归一化层双保险）：read = min(read, prompt)；write = min(write, prompt − read)；
 * - 写入价缺失按全价由调用方传入 cacheWritePrice = input 实现（D-3）；
 * - **discountAmount 可为负（product Q3 裁定，PRD v1.1 §5.4/§7.3/§8 AC-19）**：
 *   允许 cacheWriteInputPrice > inputPrice（写入价溢价），此时实际费用 > 全价口径 → 负折扣（缓存写入溢价）；
 * - 精度（D-1）：金额不在此处舍入，写库经 toFixed(8)（对齐 numeric(18,8)/cost 列），测试以 8 位断言。
 *
 * @param inputTokens - 输入 token 数（≥ 0）
 * @param outputTokens - 输出 token 数（≥ 0）
 * @param pricing - 单价（含显式缓存价字段；input 为生效输入单价）
 * @param cacheTokens - parseCacheTokens 归一化结果；null/无缓存字段 → 全价
 * @param cacheReadPrice - 生效缓存读取单价（resolveCachePricing 输出，¥ / 1K）
 * @param cacheWritePrice - 生效缓存写入单价（缺失时 = 生效 input 全价）
 * @param cacheWritePriceSource - 写入价来源标识（D-4，默认 'full_price'）
 * @returns 显式价计费结果（cost / discountAmount / 缓存 token 与费用明细）
 */
export function computeCacheCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ExplicitTokenPricing,
  cacheTokens: CacheTokenInfo | null | undefined,
  cacheReadPrice: number,
  cacheWritePrice: number,
  cacheWritePriceSource: 'explicit' | 'full_price' = 'full_price',
): CacheCostResult {
  const fullCost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;

  // 无缓存信息或 read+write 均为 0 → 全价，无缓存费用（与现状一致，回归安全）
  if (!cacheTokens || !cacheTokens.hasCacheInfo
    || (cacheTokens.cacheHitTokens <= 0 && cacheTokens.cacheWriteTokens <= 0)) {
    return {
      cost: fullCost,
      discountAmount: 0,
      cacheHitTokens: 0,
      cacheWriteTokens: 0,
      cacheMissTokens: 0,
      cacheHitCost: 0,
      cacheWriteCost: 0,
      cacheWritePriceSource,
      cacheReadPrice,
      cacheWritePrice,
    };
  }

  // D-11 收敛：优先保留 read，write 收敛到 prompt − read（归一化层已收敛，此处双保险）
  const read = Math.min(cacheTokens.cacheHitTokens, inputTokens);
  const write = Math.min(cacheTokens.cacheWriteTokens, Math.max(inputTokens - read, 0));
  const miss = inputTokens - read - write;

  const cacheHitCost = (read / 1000) * cacheReadPrice;
  const cacheWriteCost = (write / 1000) * cacheWritePrice;
  const cost =
    cacheHitCost +
    cacheWriteCost +
    (miss / 1000) * pricing.input +
    (outputTokens / 1000) * pricing.output;

  return {
    cost,
    // 可为负：cacheWritePrice > inputPrice 时实际费用 > 全价口径（缓存写入溢价，product Q3 裁定）
    discountAmount: fullCost - cost,
    cacheHitTokens: read,
    cacheWriteTokens: write,
    cacheMissTokens: miss,
    cacheHitCost,
    cacheWriteCost,
    cacheWritePriceSource,
    cacheReadPrice,
    cacheWritePrice,
  };
}

/**
 * 统一计费入口（6 路由替换点，T5 接入）— 从 usage 提取缓存字段并按当前模式计费
 *
 * 规则（任务书 v2.0 §4）：
 * - usage 为 null/非对象 → 返回 null（调用方走 computeCost 全价/预估路径，现状保持）；
 * - `cache_pricing_mode=discount_rate` → 复用 computeCacheDiscountedCost + resolveCacheDiscountRate
 *   （读取按折扣率、写入按全价，结果与旧版完全一致；补 cacheWriteTokens=0、cache 费用=0、source='full_price'）；
 * - `cache_pricing_mode=explicit`（默认）→ resolveCachePricing（4 级）+ computeCacheCost；
 * - usage 无缓存字段 → 返回全价结果（cost = 全价、cache 字段 0），计费结果与现状一致。
 *
 * @param usage - 非流式响应 body 中的 usage 对象（可为 null/undefined）
 * @param pricing - getPricingForModel 返回的定价（含显式缓存价字段）
 * @param opts - 可注入 mode/globalRate（测试避免 DB/Redis 依赖；缺省时内部自动读取）
 * @returns 显式价计费结果；usage 缺失 → null
 */
export async function computeUsageCost(
  usage: unknown,
  pricing: ModelPricing | null | undefined,
  opts?: { mode?: CachePricingMode; globalRate?: number },
): Promise<CacheCostResult | null> {
  if (usage == null || typeof usage !== 'object') return null;
  // pricing 缺失（getPricingForModel 可返回 null）→ 返回 null，调用方走 computeCost 全价/预估路径
  // （与 usage 缺失同一降级语义；避免 null 定价进入显式价/折扣公式）
  if (!pricing) return null;

  const u = usage as Record<string, unknown>;
  const inputTokens = toNonNegativeInt(u.prompt_tokens);
  const outputTokens = toNonNegativeInt(u.completion_tokens);
  const cache = parseCacheTokens(usage);
  const mode = opts?.mode ?? (await getCachePricingMode());

  if (mode === 'discount_rate') {
    // 与旧版完全一致（D-13/R-B5 对照断言覆盖）：读取按折扣率、写入按全价
    const discountRate = await resolveCacheDiscountRate(pricing, opts?.globalRate);
    const result = computeCacheDiscountedCost(inputTokens, outputTokens, pricing, cache, discountRate);
    // 快照价（D-8）：discount_rate 模式读取 = 生效 input × rate、写入 = 生效 input 全价
    const resolved = await resolveCachePricing(pricing, { mode, globalRate: opts?.globalRate });
    return {
      ...result,
      cacheWriteTokens: 0,
      cacheHitCost: 0,
      cacheWriteCost: 0,
      cacheWritePriceSource: 'full_price',
      cacheReadPrice: resolved.cacheReadPrice,
      cacheWritePrice: resolved.cacheWritePrice,
    };
  }

  // explicit 模式（默认，D-13）：4 级解析 + 显式价公式
  const resolved = await resolveCachePricing(pricing, { mode, globalRate: opts?.globalRate });
  return computeCacheCost(
    inputTokens,
    outputTokens,
    pricing,
    cache,
    resolved.cacheReadPrice,
    resolved.cacheWritePrice,
    resolved.cacheWritePriceSource,
  );
}

/**
 * 流式统一计费入口（T5 路由流式 settle 分支）— 从 determineStreamBilling 结果计费
 *
 * A9 时序（R-B2）：计费时点 = 流结束采信末帧 usage（determineStreamBilling 已透传缓存字段）；
 * fallback 分支（无 usage）缓存字段为 undefined → cacheInfo=null → 全价；无响应回滚全额由
 * 预扣/refund 路径处理（本函数不涉及）。
 *
 * 规则与 computeUsageCost 一致：discount_rate 复用旧公式（与旧版金额一致）；
 * explicit 走 resolveCachePricing + computeCacheCost；无缓存字段 → 全价。
 *
 * @param billing - determineStreamBilling 返回的流式结算结果（含透传缓存字段）
 * @param pricing - getPricingForModel 返回的定价
 * @param opts - 可注入 mode/globalRate（测试避免 DB/Redis 依赖）
 * @returns 显式价计费结果（永不为 null；无缓存信息时为全价）
 */
export async function computeStreamCost(
  billing: {
    promptTokens: number;
    completionTokens: number;
    cacheHitTokens?: number;
    cacheWriteTokens?: number;
    cacheMissTokens?: number;
  },
  pricing: ModelPricing | null | undefined,
  opts?: { mode?: CachePricingMode; globalRate?: number },
): Promise<CacheCostResult> {
  // pricing 缺失（getPricingForModel 可返回 null）→ 归一化为默认 L1 价（D-3：resolveCachePricing
  // 已按默认 input 回退；此处仅保证下游 compute* 拿到非空单价对象）
  const effPricing: ModelPricing = pricing ?? {
    input: DEFAULT_INPUT_PRICE,
    output: DEFAULT_OUTPUT_PRICE,
    cacheDiscountRate: null,
    cacheReadInputPrice: null,
    cacheWriteInputPrice: null,
  };
  const mode = opts?.mode ?? (await getCachePricingMode());
  // 缓存字段存在（A/B 分支透传）→ 组装 CacheTokenInfo；缺失（C/D fallback）→ null（全价）
  const cacheInfo: CacheTokenInfo | null =
    billing.cacheHitTokens !== undefined || billing.cacheWriteTokens !== undefined
      ? {
          cacheHitTokens: billing.cacheHitTokens ?? 0,
          cacheWriteTokens: billing.cacheWriteTokens ?? 0,
          cacheMissTokens: billing.cacheMissTokens ?? 0,
          hasCacheInfo: true,
        }
      : null;

  if (mode === 'discount_rate') {
    // 与旧版完全一致：读取按折扣率、写入按全价（快照价同 resolveCachePricing discount_rate 链）
    const discountRate = opts?.globalRate != null
      ? await resolveCacheDiscountRate(effPricing, opts.globalRate)
      : await resolveCacheDiscountRate(effPricing);
    const result = computeCacheDiscountedCost(billing.promptTokens, billing.completionTokens, effPricing, cacheInfo, discountRate);
    const resolved = await resolveCachePricing(effPricing, { mode, globalRate: opts?.globalRate });
    return {
      ...result,
      cacheWriteTokens: 0,
      cacheHitCost: 0,
      cacheWriteCost: 0,
      cacheWritePriceSource: 'full_price',
      cacheReadPrice: resolved.cacheReadPrice,
      cacheWritePrice: resolved.cacheWritePrice,
    };
  }

  const resolved = await resolveCachePricing(effPricing, { mode, globalRate: opts?.globalRate });
  return computeCacheCost(
    billing.promptTokens,
    billing.completionTokens,
    effPricing,
    cacheInfo,
    resolved.cacheReadPrice,
    resolved.cacheWritePrice,
    resolved.cacheWritePriceSource,
  );
}
