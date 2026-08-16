/**
 * Usage 解析器 — 从上游响应提取 usage（流式/非流式）
 *
 * 职责：
 * - 从流式 StreamState 中提取最后有效 usage
 * - 从非流式响应 body 中提取 usage
 * - 统一返回 TokenUsage 格式
 * - 提取缓存命中/未命中 token（Anthropic / DeepSeek / OpenAI 三种格式归一化）
 *
 * @module services/billing
 */

import type { TokenUsage, StreamState } from '../upstream/proxy.js';

// ============================================================
// 缓存 token 提取
// ============================================================

/**
 * 缓存 token 信息（归一化后的缓存命中/未命中数量）
 */
export interface CacheTokenInfo {
  /** 缓存命中 token 数（按 10% 打折计费的部分） */
  cacheHitTokens: number;
  /** 缓存未命中 token 数（按全价计费的部分） */
  cacheMissTokens: number;
  /** usage 中是否含缓存字段（上游支持缓存计费） */
  hasCacheInfo: boolean;
}

/**
 * 将任意值规范化为非负整数 token 数
 *
 * 与 extractUsageFromNonStream 的 `Number(x) || 0` 语义对齐，额外防御负数/小数。
 *
 * @param value - 上游返回的原始值（可能是 number / string / undefined）
 * @returns 非负整数；非法输入返回 0
 */
export function toNonNegativeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 从 usage 中提取缓存命中/未命中 token（支持三种上游格式归一化）
 *
 * 格式对照：
 * - Anthropic：`cache_read_input_tokens`（读取命中，打折）；`cache_creation_input_tokens`（写入缓存，全价，不计入命中）
 * - DeepSeek：`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（两者成对出现）
 * - OpenAI：`prompt_tokens_details.cached_tokens`（缓存命中）
 *
 * 归一化规则（hit + miss 合计应等于 input_tokens，不一致时以显式字段为准，不强行对齐）：
 * - 显式给出 hit 和 miss → 原样采信（即使合计 ≠ prompt_tokens）
 * - 只给出 hit → miss = max(prompt_tokens - hit, 0)
 * - 只给出 miss → hit = max(prompt_tokens - miss, 0)
 * - 无任何缓存字段 → hasCacheInfo = false
 *
 * 格式优先级：DeepSeek（hit/miss 最完整）→ Anthropic → OpenAI。
 *
 * @param usage - 非流式响应 body 中的 usage 对象（可为 null/undefined）
 * @returns 归一化后的缓存 token 信息
 */
export function parseCacheTokens(usage: unknown): CacheTokenInfo {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>;
  const inputTokens = toNonNegativeInt(u.prompt_tokens);

  // DeepSeek：prompt_cache_hit_tokens / prompt_cache_miss_tokens
  const dsHit = toNonNegativeInt(u.prompt_cache_hit_tokens);
  const dsMiss = toNonNegativeInt(u.prompt_cache_miss_tokens);
  const hasDeepSeek = u.prompt_cache_hit_tokens !== undefined || u.prompt_cache_miss_tokens !== undefined;

  // Anthropic：cache_read_input_tokens（读取命中）
  const anthropicHit = toNonNegativeInt(u.cache_read_input_tokens);
  const hasAnthropic = u.cache_read_input_tokens !== undefined;

  // OpenAI：prompt_tokens_details.cached_tokens
  const details = (u.prompt_tokens_details && typeof u.prompt_tokens_details === 'object')
    ? u.prompt_tokens_details as Record<string, unknown>
    : {};
  const openaiHit = toNonNegativeInt(details.cached_tokens);
  const hasOpenAI = details.cached_tokens !== undefined;

  if (hasDeepSeek) {
    const hit = dsHit > 0 ? dsHit : Math.max(inputTokens - dsMiss, 0);
    const miss = dsMiss > 0 ? dsMiss : Math.max(inputTokens - hit, 0);
    return { cacheHitTokens: hit, cacheMissTokens: miss, hasCacheInfo: true };
  }

  if (hasAnthropic) {
    return {
      cacheHitTokens: anthropicHit,
      cacheMissTokens: Math.max(inputTokens - anthropicHit, 0),
      hasCacheInfo: true,
    };
  }

  if (hasOpenAI) {
    return {
      cacheHitTokens: openaiHit,
      cacheMissTokens: Math.max(inputTokens - openaiHit, 0),
      hasCacheInfo: true,
    };
  }

  return { cacheHitTokens: 0, cacheMissTokens: 0, hasCacheInfo: false };
}

// ============================================================
// Usage 提取
// ============================================================

/**
 * 从流式 StreamState 中提取 usage
 *
 * 规则：
 * - lastValidUsage 非空 → 直接返回（上游最后一帧给了 usage）
 * - lastValidUsage 为空 → 返回 null（需要本地 fallback）
 *
 * @param state - 流式转发后返回的状态
 * @returns TokenUsage 或 null
 */
export function extractUsageFromStream(
  state: StreamState,
): TokenUsage | null {
  return state.lastValidUsage;
}

/**
 * 从非流式响应 body 中提取 usage
 *
 * 规则：
 * - response.usage 存在 → 解析并返回
 * - 不存在 → 返回 null（需要本地 fallback）
 *
 * @param body - 非流式响应 body（已解析为 JSON）
 * @returns TokenUsage 或 null
 */
export function extractUsageFromNonStream(
  body: Record<string, unknown>,
): TokenUsage | null {
  if (!body.usage) return null;

  const u = body.usage as Record<string, unknown>;
  return {
    prompt_tokens: Number(u.prompt_tokens) || 0,
    completion_tokens: Number(u.completion_tokens) || 0,
    total_tokens: Number(u.total_tokens) || 0,
  };
}

/**
 * 合并 usage：从上游 usage 和本地计算的 token 数中选取合适的值
 *
 * @param upstreamUsage - 上游返回的 usage（可能为 null）
 * @param localInputTokens - 本地计算的输入 token 数
 * @param localOutputTokens - 本地计算的输出 token 数
 * @returns 合并后的 TokenUsage
 */
export function mergeUsage(
  upstreamUsage: TokenUsage | null,
  localInputTokens: number,
  localOutputTokens: number,
): TokenUsage {
  if (upstreamUsage) {
    return upstreamUsage;
  }

  return {
    prompt_tokens: localInputTokens,
    completion_tokens: localOutputTokens,
    total_tokens: localInputTokens + localOutputTokens,
  };
}
