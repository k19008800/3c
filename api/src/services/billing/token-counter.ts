/**
 * Token 计数字段 — js-tiktoken 本地计数
 *
 * 职责：
 * - 请求前估算输入 token 数（estimateInputTokens）
 * - 对已生成文本计数（countOutputTokens），供 fallback 使用
 * - 内置常见模型的 encoding 映射，不支持的模型 fallback 到 cl100k_base
 *
 * @see newapi-migration-guide.md §2.2 上游返回 token 数但中途连接断开
 * @module services/billing
 */

import { getEncoding, getEncodingNameForModel } from "js-tiktoken";

/**
 * OpenAI Chat Completion message 格式
 */
export interface TokenCountMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string;
  name?: string;
  /** 工具调用（assistant message 可选） */
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** 工具调用 ID（tool message 必填） */
  tool_call_id?: string;
}

/**
 * 模型 → encoding 名称映射表
 *
 * 覆盖常见 OpenAI 及兼容模型。
 * 不在表中的模型统一 fallback 到 cl100k_base。
 */
const MODEL_ENCODING_MAP: Record<string, string> = {
  // GPT-4 系列
  "gpt-4": "cl100k_base",
  "gpt-4-0314": "cl100k_base",
  "gpt-4-32k": "cl100k_base",
  "gpt-4-32k-0314": "cl100k_base",
  "gpt-4-turbo": "cl100k_base",
  "gpt-4-turbo-2024-04-09": "cl100k_base",
  "gpt-4o": "o200k_base",
  "gpt-4o-2024-05-13": "o200k_base",
  "gpt-4o-2024-08-06": "o200k_base",
  "gpt-4o-mini": "o200k_base",
  "gpt-4o-mini-2024-07-18": "o200k_base",
  "gpt-4-vision-preview": "cl100k_base",
  "gpt-4-1106-preview": "cl100k_base",
  "gpt-4-0125-preview": "cl100k_base",

  // GPT-3.5 系列
  "gpt-3.5-turbo": "cl100k_base",
  "gpt-3.5-turbo-0301": "cl100k_base",
  "gpt-3.5-turbo-0613": "cl100k_base",
  "gpt-3.5-turbo-16k": "cl100k_base",
  "gpt-3.5-turbo-16k-0613": "cl100k_base",
  "gpt-3.5-turbo-1106": "cl100k_base",
  "gpt-3.5-turbo-0125": "cl100k_base",

  // O 系列
  "o1": "o200k_base",
  "o1-mini": "o200k_base",
  "o1-preview": "o200k_base",
  "o3-mini": "o200k_base",

  // Embedding
  "text-embedding-ada-002": "cl100k_base",
  "text-embedding-3-small": "cl100k_base",
  "text-embedding-3-large": "cl100k_base",

  // Davinci
  "text-davinci-003": "p50k_base",
  "text-davinci-002": "p50k_base",
  "text-curie-001": "p50k_base",
  "text-babbage-001": "p50k_base",
  "text-ada-001": "p50k_base",
  "davinci": "r50k_base",
  "curie": "r50k_base",
  "babbage": "r50k_base",
  "ada": "r50k_base",

  // Codex
  "code-davinci-002": "p50k_base",
  "code-cushman-001": "p50k_base",
};

/** 默认 encoding 名称（不支持的模型 fallback） */
const DEFAULT_ENCODING = "cl100k_base";

/**
 * OpenAI message 格式化的固定 overhead（每 message 约 3-4 tokens）
 * 参考：https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
 */
const TOKENS_PER_MESSAGE = 3;
const TOKENS_PER_NAME = 1;

/**
 * 获取模型对应的 encoding 名称
 *
 * 优先使用 js-tiktoken 内置的 getEncodingNameForModel，
 * 如果抛出异常（未知模型），从 MODEL_ENCODING_MAP 查找，
 * 都没有则 fallback 到 cl100k_base。
 *
 * @param model - 模型名称（如 "gpt-4", "deepseek-chat"）
 * @returns encoding 名称（如 "cl100k_base", "o200k_base"）
 */
function resolveEncodingName(model: string): string {
  // 1. 尝试 js-tiktoken 内置映射
  try {
    return getEncodingNameForModel(model);
  } catch {
    // 未知模型，查自定义映射
  }

  // 2. 模糊匹配：去掉日期后缀再试
  const baseModel = model.replace(/-\d{4}$/, "");
  if (MODEL_ENCODING_MAP[baseModel]) {
    return MODEL_ENCODING_MAP[baseModel];
  }

  // 3. 自定义映射精确匹配
  if (MODEL_ENCODING_MAP[model]) {
    return MODEL_ENCODING_MAP[model];
  }

  // 4. 模糊前缀匹配
  for (const [prefix, encoding] of Object.entries(MODEL_ENCODING_MAP)) {
    if (model.startsWith(prefix)) {
      return encoding;
    }
  }

  // 5. 最终 fallback
  return DEFAULT_ENCODING;
}

/**
 * 估算单条消息的 token 数
 *
 * 公式：tokens_per_message (3) + encode(role) + encode(content) + (name ? 1+encode(name) : 0)
 * 与 OpenAI 官方 token 计数方法保持对齐。
 *
 * @param msg - 聊天消息
 * @param encodingName - encoding 名称
 * @returns 该消息的 token 估算值
 */
function countMessageTokens(msg: TokenCountMessage, encodingName: string): number {
  const enc = getEncoding(encodingName);
  let tokens = TOKENS_PER_MESSAGE;

  // role encoding
  const roleTokens = enc.encode(msg.role);
  tokens += roleTokens.length;

  // content encoding
  if (typeof msg.content === "string" && msg.content.length > 0) {
    const contentTokens = enc.encode(msg.content);
    tokens += contentTokens.length;
  }

  // name (if present)
  if (msg.name) {
    tokens += TOKENS_PER_NAME;
    const nameTokens = enc.encode(msg.name);
    tokens += nameTokens.length;
  }

  // tool_calls (assistant message)
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    for (const tc of msg.tool_calls) {
      const fnTokens = enc.encode(tc.function.name);
      const argsTokens = enc.encode(tc.function.arguments);
      tokens += fnTokens.length + argsTokens.length;
    }
  }

  return tokens;
}

/**
 * 请求前估算输入 token 数
 *
 * 对 messages 数组中的每条消息单独计算 token 数后求和。
 * 与 OpenAI 官方 tiktoken 行为对齐（含 role/name/format overhead）。
 *
 * @param model - 模型名称（如 "gpt-4o", "deepseek-chat"）
 * @param messages - 聊天消息数组
 * @returns 估算的输入 token 数
 *
 * @example
 * ```ts
 * const tokens = estimateInputTokens("gpt-4o", [
 *   { role: "system", content: "你是一个助手" },
 *   { role: "user", content: "你好" },
 * ]);
 * ```
 *
 * @see https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
 */
export function estimateInputTokens(
  model: string,
  messages: TokenCountMessage[],
): number {
  if (!messages || messages.length === 0) {
    // 空消息数组仍有 priming overhead（约 3 tokens）
    return 3;
  }

  const encodingName = resolveEncodingName(model);

  let total = 0;
  for (const msg of messages) {
    total += countMessageTokens(msg, encodingName);
  }

  // 每次请求的 priming overhead（OpenAI 官方建议 +3 tokens）
  total += 3;

  return total;
}

/**
 * 对已生成文本进行 token 计数（fallback 用）
 *
 * 当上游不返回 usage 时，用此函数对已收集的文本进行本地 token 计数。
 * 注意：这只计算纯文本 token，不包含 role/format overhead，
 * 因此 estimateInputTokens + countOutputTokens 的结果可能略低于上游真实值。
 *
 * @param model - 模型名称
 * @param text - 已生成的文本内容
 * @returns 该文本的 token 估算值
 *
 * @throws 当 text 为 null/undefined 时返回 0（不抛异常）
 *
 * @example
 * ```ts
 * const outputTokens = countOutputTokens("gpt-4o", "你好，世界！");
 * ```
 */
export function countOutputTokens(model: string, text: string): number {
  if (!text || text.length === 0) return 0;

  const encodingName = resolveEncodingName(model);
  const enc = getEncoding(encodingName);
  const tokens = enc.encode(text);
  return tokens.length;
}

/**
 * 获取模型对应的 encoding 名称（公开导出，供测试和调试使用）
 *
 * @param model - 模型名称
 * @returns encoding 名称
 */
export function getModelEncoding(model: string): string {
  return resolveEncodingName(model);
}
