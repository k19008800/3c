/**
 * Usage 解析器 — 从上游响应提取 token usage
 *
 * 职责：
 * - 非流式：从 JSON body 的 `usage` 字段提取
 * - 流式：从流式 chunks 中累加，最终帧的 usage 为权威值
 * - 区分 trustUpstream（完全采信上游）和 fallback（本地 tiktoken 估算）两种模式
 *
 * @see newapi-migration-guide.md §2.2 上游返回 token 数但中途连接断开
 * @see coding-standards-control-logic.md §二 计费会话状态机
 * @module services/billing
 */

import { countOutputTokens } from "./token-counter";

// ===== 类型定义 =====

/**
 * 上游 usage 原始结构（OpenAI 兼容格式）
 */
export interface UpstreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Stream chunk 中的 delta choice（单条）
 */
export interface StreamChoice {
  index?: number;
  delta?: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      index?: number;
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason?: string | null;
}

/**
 * Stream chunk 结构（OpenAI SSE data 行解析后）
 */
export interface StreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: StreamChoice[];
  usage?: UpstreamUsage | null;
}

/**
 * 流式累积状态
 *
 * 在 SSE 转发过程中逐步累积，用于最终计费决策。
 */
export interface StreamState {
  /** 最后一个有效 usage（来自 finish_reason 非空的 chunk 或任意有 usage 的 chunk） */
  lastValidUsage: UpstreamUsage | null;
  /** 已生成的文本（所有 delta.content 拼接） */
  generatedText: string;
  /** 最后一个非空 finish_reason，正常完成为 "stop" */
  finishReason: string | null;
  /** 已接收 chunk 总数 */
  totalChunks: number;
  /** 流是否异常结束（连接断开、超时等） */
  abnormalEnd: boolean;
}

/**
 * Usage 提取结果 — 统一的计费输入
 */
export interface ParsedUsage {
  /** 输入 token 数 */
  inputTokens: number;
  /** 输出 token 数 */
  outputTokens: number;
  /** 总 token 数（inputTokens + outputTokens） */
  totalTokens: number;
  /** true = 完全采信上游返回的 usage */
  trustUpstream: boolean;
  /** true = 使用了本地 tiktoken 估算（无可靠上游 data） */
  fallback: boolean;
}

// ===== 非流式 Usage 提取 =====

/**
 * 从非流式 JSON 响应提取 usage
 *
 * 从 `response.usage` 提取 prompt_tokens / completion_tokens / total_tokens。
 * 如果上游返回了完整 usage，trustUpstream=true, fallback=false。
 * 如果上游没返回 usage，标记为不可信（不在此函数做 fallback — 调用方决定策略）。
 *
 * @param body - JSON 响应体（已 parse）
 * @returns 解析后的 usage 信息
 *
 * @example
 * ```ts
 * const body = JSON.parse(upstreamRespText);
 * const usage = extractUsageFromResponse(body);
 * // => { inputTokens: 150, outputTokens: 80, totalTokens: 230, trustUpstream: true, fallback: false }
 * ```
 */
export function extractUsageFromResponse(body: Record<string, unknown>): ParsedUsage {
  const usage = (body.usage ?? body.usage_data ?? {}) as UpstreamUsage;

  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens);

  // 如果至少有一个值非零，认为上游提供了有效 usage
  const hasValidUsage = (usage.prompt_tokens ?? 0) > 0 || (usage.completion_tokens ?? 0) > 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    trustUpstream: hasValidUsage,
    fallback: !hasValidUsage,
  };
}

// ===== 流式 Usage 提取 =====

/**
 * 从流式累积状态中提取 usage
 *
 * 决策逻辑（对齐 newapi-migration-guide.md §2.1 计费决策）：
 *   1. 正常结束 + 有有效 usage → 完全采信上游（trustUpstream=true）
 *   2. 异常结束但有 usage → 采信最后一帧 usage（trustUpstream=true）
 *   3. 异常结束且无 usage + 有已生成文本 → 本地 tiktoken 计算（fallback=true）
 *   4. 异常结束且无 usage + 无生成文本 → 只收输入 token 费（不对输出计费）
 *
 * @param state - 流式累积状态
 * @param estimatedInputTokens - 请求前估算的输入 token 数（用于 fallback）
 * @param model - 模型名称（用于 fallback 时 tiktoken 计数）
 * @returns 解析后的 usage 信息
 *
 * @example
 * ```ts
 * const state: StreamState = {
 *   lastValidUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
 *   generatedText: "Hello world",
 *   finishReason: "stop",
 *   totalChunks: 10,
 *   abnormalEnd: false,
 * };
 * const usage = extractUsageFromStream(state, 120, "gpt-4o");
 * // => { inputTokens: 100, outputTokens: 50, totalTokens: 150, trustUpstream: true, fallback: false }
 * ```
 */
export function extractUsageFromStream(
  state: StreamState,
  estimatedInputTokens: number,
  model: string,
): ParsedUsage {
  // Case 1: 正常结束 + 有有效 usage → 完全采信上游
  if (!state.abnormalEnd && state.lastValidUsage) {
    return {
      inputTokens: state.lastValidUsage.prompt_tokens ?? 0,
      outputTokens: state.lastValidUsage.completion_tokens ?? 0,
      totalTokens: state.lastValidUsage.total_tokens ?? 0,
      trustUpstream: true,
      fallback: false,
    };
  }

  // Case 2: 异常结束但有 usage → 采信最后一帧 usage
  if (state.abnormalEnd && state.lastValidUsage) {
    const upstreamInput = state.lastValidUsage.prompt_tokens ?? 0;
    const upstreamOutput = state.lastValidUsage.completion_tokens ?? 0;
    return {
      inputTokens: upstreamInput,
      outputTokens: upstreamOutput,
      totalTokens: upstreamInput + upstreamOutput,
      trustUpstream: true,
      fallback: false,
    };
  }

  // Case 3: 异常结束且无 usage + 有已生成文本 → 本地 tiktoken
  if (state.abnormalEnd && state.generatedText.length > 0) {
    const localOutput = countOutputTokens(model, state.generatedText);
    return {
      inputTokens: estimatedInputTokens,
      outputTokens: localOutput,
      totalTokens: estimatedInputTokens + localOutput,
      trustUpstream: false,
      fallback: true,
    };
  }

  // Case 4: 异常结束且无 usage + 无生成文本 → 只对输入计费
  return {
    inputTokens: estimatedInputTokens,
    outputTokens: 0,
    totalTokens: estimatedInputTokens,
    trustUpstream: false,
    fallback: true,
  };
}

/**
 * 更新流式累积状态（处理一个 chunk）
 *
 * SSE 转发循环中每收到一个 chunk 就调用一次，
 * 自动更新 accumulatedState 中的 usage/generatedText/finishReason。
 *
 * **规则（对齐 New API）**：
 * - 只有 finish_reason 非空的 frame，其 usage 才是最终值
 * - 所有 delta.content 拼接为 generatedText
 * - finish_reason 非空时更新 finishReason
 *
 * @param state - 当前累积状态（会被原地修改）
 * @param chunk - 解析后的 stream chunk
 *
 * @example
 * ```ts
 * const state = createStreamState();
 * for (const chunk of chunks) {
 *   updateStreamState(state, chunk);
 * }
 * ```
 */
export function updateStreamState(state: StreamState, chunk: StreamChunk): void {
  state.totalChunks++;

  for (const choice of chunk.choices ?? []) {
    // 收集生成的文本
    if (choice.delta?.content) {
      state.generatedText += choice.delta.content;
    }

    // finish_reason 非空 → 这是最后一帧，更新 finishReason
    if (choice.finish_reason) {
      state.finishReason = choice.finish_reason;
      // 这一帧的 usage 是权威的最终值
      if (chunk.usage) {
        state.lastValidUsage = chunk.usage;
      }
    }

    // 有些上游在 finish_reason 为空时也返回 usage（累积值）
    // 此时保存但不作为 final（只有 finish_reason 非空的 usage 才是最终值）
    // 然而如果从未收到过带 finish_reason 的 usage，我们也保存作为 fallback
    if (chunk.usage && !choice.finish_reason && !state.lastValidUsage) {
      state.lastValidUsage = chunk.usage;
    }
  }
}

/**
 * 创建初始流式累积状态
 *
 * @returns 新创建的空白 StreamState
 */
export function createStreamState(): StreamState {
  return {
    lastValidUsage: null,
    generatedText: "",
    finishReason: null,
    totalChunks: 0,
    abnormalEnd: false,
  };
}

// ===== 价格计算 =====

/**
 * 精度工具：四舍五入到 4 位小数（最小计费单位 0.0001 元）
 */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * 计算输出 token 价格（含补全倍率）
 *
 * 输出 token 价格 = 输入价 × output_multiplier。
 * output_multiplier > 1 表示输出比输入贵（如 GPT-4 的输出常是输入的 2-3 倍）。
 *
 * @param inputPrice - 输入价格（元/1K tokens），需 >= 0
 * @param outputMultiplier - 输出倍率（从 vendor_models 表读），默认 1.0
 * @returns 输出价格（元/1K tokens），精度 4 位小数
 *
 * @example
 * ```ts
 * // 输入价 0.03 元/1K，输出倍率 2.0 → 输出价 0.06 元/1K
 * const outputPrice = calculateOutputPrice(0.03, 2.0); // => 0.06
 * ```
 */
export function calculateOutputPrice(inputPrice: number, outputMultiplier = 1.0): number {
  if (inputPrice < 0) {
    throw new Error("输入价格不能为负数");
  }
  if (outputMultiplier < 0) {
    throw new Error("输出倍率不能为负数");
  }
  return round4(inputPrice * outputMultiplier);
}

/**
 * 计算总费用
 *
 * 费用 = (inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice。
 * 精度：4 位小数（最小计费单位 0.0001 元）。
 *
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 * @param inputPrice - 输入单价（元/1K tokens）
 * @param outputPrice - 输出单价（元/1K tokens）
 * @returns 总费用（元）
 */
export function calculateTotalCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice: number,
  outputPrice: number,
): number {
  const inputCost = (inputTokens / 1000) * inputPrice;
  const outputCost = (outputTokens / 1000) * outputPrice;
  return round4(inputCost + outputCost);
}
