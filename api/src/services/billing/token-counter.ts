/**
 * Token 计数器 — 使用 js-tiktoken 进行本地 token 计数
 *
 * 职责：
 * - 本地计算文本的 token 数（上游不返回 usage 时的 fallback）
 * - 支持按模型选择对应的 encoding
 * - 提供 countTokens / countMessagesTokens 两个入口
 *
 * @module services/billing
 */

import { encodingForModel } from 'js-tiktoken';
import type { TiktokenModel } from 'js-tiktoken';

// ============================================================
// 模型 → tiktoken encoding 映射
// ============================================================

/** 已知的 tiktoken 模型列表（用于判断是否支持精确 encoding） */
const KNOWN_TIKTOKEN_MODELS: Set<string> = new Set([
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0301',
  'gpt-3.5-turbo-0613',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-16k',
  'text-embedding-ada-002',
  'text-embedding-3-small',
  'text-embedding-3-large',
]);

/** 对于未知模型，使用 cl100k_base encoding（GPT-4/3.5 的通用 encoding） */
const FALLBACK_MODEL: TiktokenModel = 'gpt-4o';

// ============================================================
// Token 计数
// ============================================================

/**
 * 计算文本的 token 数
 *
 * - 如果 model 在 js-tiktoken 已知列表中 → 使用该模型的 encoding
 * - 否则 → 使用 gpt-4o 作为 fallback（cl100k_base encoding）
 *
 * @param text - 待计数的文本
 * @param model - 模型名称（如 "gpt-4o", "deepseek-v3"）
 * @returns token 数量
 */
export function countTokens(text: string, model: string): number {
  if (!text || text.length === 0) return 0;

  try {
    // 规范化模型名（去前缀、小写）
    const normalizedModel = normalizeModelName(model);
    const tiktokenModel = KNOWN_TIKTOKEN_MODELS.has(normalizedModel)
      ? (normalizedModel as TiktokenModel)
      : FALLBACK_MODEL;

    const encoder = encodingForModel(tiktokenModel);
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch {
    // tiktoken 失败时的粗略估算（英文 ~4 char/token, 中文 ~1.5 char/token）
    return roughTokenCount(text);
  }
}

/**
 * 计算 messages 数组的 token 数
 *
 * 按 OpenAI 的计数规则：每条 message 有固定开销（~4 token），
 * 加上 role 和 content 的 token。
 *
 * @param messages - 消息数组
 * @param model - 模型名称
 * @returns token 数量
 */
export function countMessagesTokens(
  messages: Array<{ role: string; content: string | unknown }>,
  model: string,
): number {
  if (!messages || messages.length === 0) return 0;

  let totalTokens = 0;

  for (const msg of messages) {
    // 每条 message 有 ~4 token 的格式开销
    totalTokens += 4;

    // role token
    if (msg.role) {
      totalTokens += countTokens(msg.role, model);
    }

    // content token
    if (typeof msg.content === 'string') {
      totalTokens += countTokens(msg.content, model);
    } else if (msg.content) {
      // 多模态 content → 用 JSON 序列化后估算
      totalTokens += countTokens(JSON.stringify(msg.content), model);
    }
  }

  // 每次请求有 ~2 token 的 priming 开销
  totalTokens += 2;

  return totalTokens;
}

// ============================================================
// Helpers
// ============================================================

/**
 * 规范化模型名：去前缀转义，小写
 *
 * @param model - 原始模型名
 * @returns 规范化后的模型名
 */
function normalizeModelName(model: string): string {
  // 去除可能的前缀（如 "openai/"）
  const parts = model.split('/');
  const name = parts[parts.length - 1]!;
  return name.toLowerCase();
}

/**
 * 粗略 token 估算（当 tiktoken 不可用时）
 *
 * 规则：
 * - 英文/数字/符号：~4 字符 = 1 token
 * - 中文字符：~1.5 字符 = 1 token
 * - 混合文本按比例估算
 *
 * @param text - 待估算的文本
 * @returns 估算的 token 数
 */
function roughTokenCount(text: string): number {
  let chineseChars = 0;
  let otherChars = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK 统一汉字范围
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x20000 && code <= 0x2A6DF)
    ) {
      chineseChars++;
    } else {
      otherChars++;
    }
  }

  // 中文 ~1.5 char/token, 英文 ~4 char/token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}
