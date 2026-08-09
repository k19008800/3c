/**
 * 流式结算决策 — determineStreamBilling
 *
 * 职责：
 * - 根据 StreamState 和是否异常终止，决定如何计费
 * - 上游返回完整 usage → 采信，trust_upstream=true
 * - 上游中途断开但最后帧有 usage → 采信最后一帧
 * - 上游中断且无 usage → 本地 tiktoken 计算，fallback=true
 *
 * @see newapi-migration-guide.md §2.2 中断后结算
 * @module services/billing
 */

import type { StreamState } from '../upstream/proxy.js';
import { countTokens } from './token-counter.js';

// ============================================================
// Types
// ============================================================

/**
 * 流式结算决策结果
 */
export interface StreamBillingResult {
  /** 最终确认的总 token 数 */
  totalTokens: number;
  /** 输入 token 数 */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 是否采信上游 usage */
  trustUpstream: boolean;
  /** 是否使用了本地 tiktoken fallback */
  fallback: boolean;
}

// ============================================================
// 结算决策
// ============================================================

/**
 * 流式结算决策
 *
 * 决策逻辑（优先级从高到低）：
 *
 *   A. 正常结束 + 有有效 usage → 采信上游，trust_upstream=true
 *      例：finish_reason='stop' + usage={prompt:100, completion:50, total:150}
 *
 *   B. 异常终止 + 最后帧有 usage → 采信最后一帧，trust_upstream=true
 *      例：连接断开前收到了 finish_reason='length' 的帧
 *
 *   C. 异常终止 + 无 usage + 有生成文本 → 本地 tiktoken 计算输出，fallback=true
 *      例：连接断开，从未收到过 finish_reason 非空的帧
 *
 *   D. 异常终止 + 无 usage + 无文本 → 只收输入 token，fallback=true
 *      例：连接立即断开，没有任何数据
 *
 * @param state - 流式转发后的状态
 * @param isAbnormalEnd - 是否为异常终止（中断、超时等）
 * @param estimatedInputTokens - 预估的输入 token 数（用于 fallback）
 * @param model - 模型名称（用于 tiktoken encoding 选择）
 * @returns StreamBillingResult
 */
export function determineStreamBilling(
  state: StreamState,
  isAbnormalEnd: boolean,
  estimatedInputTokens: number,
  model = 'gpt-4o',
): StreamBillingResult {
  // A. 正常结束 + 有效 usage → 完全采信上游
  if (!isAbnormalEnd && state.lastValidUsage) {
    return {
      totalTokens: state.lastValidUsage.total_tokens,
      promptTokens: state.lastValidUsage.prompt_tokens,
      completionTokens: state.lastValidUsage.completion_tokens,
      trustUpstream: true,
      fallback: false,
    };
  }

  // B. 异常终止但最后帧有 usage → 采信上游（上游在最后一帧给了总 token 数）
  if (isAbnormalEnd && state.lastValidUsage) {
    return {
      totalTokens: state.lastValidUsage.total_tokens,
      promptTokens: state.lastValidUsage.prompt_tokens,
      completionTokens: state.lastValidUsage.completion_tokens,
      trustUpstream: true,
      fallback: false,
    };
  }

  // C. 异常终止 + 无 usage + 有生成文本 → 本地计算
  if (isAbnormalEnd && state.generatedText.length > 0) {
    const localOutputTokens = countTokens(state.generatedText, model);
    const totalTokens = estimatedInputTokens + localOutputTokens;

    return {
      totalTokens,
      promptTokens: estimatedInputTokens,
      completionTokens: localOutputTokens,
      trustUpstream: false,
      fallback: true,
    };
  }

  // D. 异常终止 + 无 usage + 无文本 → 只收输入 token
  return {
    totalTokens: estimatedInputTokens,
    promptTokens: estimatedInputTokens,
    completionTokens: 0,
    trustUpstream: false,
    fallback: true,
  };
}
