/**
 * Usage 解析器 — 从上游响应提取 usage（流式/非流式）
 *
 * 职责：
 * - 从流式 StreamState 中提取最后有效 usage
 * - 从非流式响应 body 中提取 usage
 * - 统一返回 TokenUsage 格式
 *
 * @module services/billing
 */

import type { TokenUsage, StreamState } from '../upstream/proxy.js';

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
