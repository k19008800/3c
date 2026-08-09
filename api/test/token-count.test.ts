/**
 * Token 计数测试 — 7 个测试用例
 *
 * 覆盖：
 * - 上游返回完整 usage → 采信，trust_upstream=true
 * - 上游中途断开但最后帧有 usage → 采信最后一帧
 * - 上游中断且无 usage → 本地 tiktoken 计算，fallback=true
 * - 非流式 → 从 response.usage 提取
 * - 流式 → 从最后一个 finish_reason 非空的 chunk 提取 usage
 */

import { describe, it, expect } from 'vitest';
import { countTokens } from '../src/services/billing/token-counter.js';
import { extractUsageFromStream, extractUsageFromNonStream, mergeUsage } from '../src/services/billing/usage-parser.js';
import { determineStreamBilling } from '../src/services/billing/settle-stream.js';
import type { StreamState, TokenUsage } from '../src/services/upstream/proxy.js';

// ============================================================
// Helpers
// ============================================================

function makeStreamState(overrides: Partial<StreamState> = {}): StreamState {
  return {
    lastValidUsage: null,
    generatedText: '',
    finishReason: null,
    totalChunks: 0,
    ...overrides,
  };
}

// ============================================================
// Token 计数器测试
// ============================================================

describe('Token 计数', () => {
  it('1. 上游返回完整 usage → 采信，trust_upstream=true', () => {
    const state = makeStreamState({
      lastValidUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      finishReason: 'stop',
      generatedText: 'Hello, how can I help you?',
      totalChunks: 5,
    });

    const result = determineStreamBilling(state, false, 120, 'gpt-4o');

    expect(result.trustUpstream).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.totalTokens).toBe(150);
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
  });

  it('2. 上游中途断开但最后帧有 usage → 采信最后一帧', () => {
    // 连接中断，但最后收到的 finish_reason='length' 帧有 usage
    const state = makeStreamState({
      lastValidUsage: { prompt_tokens: 80, completion_tokens: 120, total_tokens: 200 },
      finishReason: 'length',
      generatedText: 'Incomplete response...',
      totalChunks: 10,
    });

    const result = determineStreamBilling(state, true, 100, 'gpt-4o');

    expect(result.trustUpstream).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.totalTokens).toBe(200);
    expect(result.promptTokens).toBe(80);
    expect(result.completionTokens).toBe(120);
  });

  it('3. 上游中断且无 usage → 本地 tiktoken 计算，fallback=true', () => {
    // 连接中断，从未收到 finish_reason 非空的帧
    const state = makeStreamState({
      lastValidUsage: null,
      finishReason: null,
      generatedText: 'This is a partial response that was cut off mid',
      totalChunks: 3,
    });

    const estimatedInputTokens = 50;
    const result = determineStreamBilling(state, true, estimatedInputTokens, 'gpt-4o');

    expect(result.trustUpstream).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.promptTokens).toBe(estimatedInputTokens);
    // 输出 token 由 tiktoken 本地计算
    expect(result.completionTokens).toBeGreaterThan(0);
    expect(result.totalTokens).toBe(estimatedInputTokens + result.completionTokens);
  });

  it('4. 非流式 → 从 response.usage 提取', () => {
    const responseBody = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1677652288,
      model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 9, completion_tokens: 12, total_tokens: 21 },
    };

    const usage = extractUsageFromNonStream(responseBody);

    expect(usage).not.toBeNull();
    expect(usage!.prompt_tokens).toBe(9);
    expect(usage!.completion_tokens).toBe(12);
    expect(usage!.total_tokens).toBe(21);
  });

  it('5. 非流式无 usage → 返回 null', () => {
    const responseBody = {
      id: 'chatcmpl-456',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      // 无 usage 字段
    };

    const usage = extractUsageFromNonStream(responseBody);

    expect(usage).toBeNull();
  });

  it('6. 流式 → 从最后一个 finish_reason 非空的 chunk 提取 usage', () => {
    const state: StreamState = {
      lastValidUsage: { prompt_tokens: 30, completion_tokens: 70, total_tokens: 100 },
      generatedText: 'Full response text here',
      finishReason: 'stop',
      totalChunks: 8,
    };

    const usage = extractUsageFromStream(state);

    expect(usage).not.toBeNull();
    expect(usage!.prompt_tokens).toBe(30);
    expect(usage!.completion_tokens).toBe(70);
    expect(usage!.total_tokens).toBe(100);
  });

  it('7. 流式无 usage → 返回 null（触发本地 fallback）', () => {
    const state: StreamState = {
      lastValidUsage: null,
      generatedText: 'Some text',
      finishReason: null,
      totalChunks: 2,
    };

    const usage = extractUsageFromStream(state);

    expect(usage).toBeNull();
  });
});

// ============================================================
// mergeUsage 测试
// ============================================================

describe('mergeUsage', () => {
  it('上游有 usage → 直接返回上游值', () => {
    const upstream: TokenUsage = { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 };
    const result = mergeUsage(upstream, 40, 25);

    expect(result).toEqual(upstream);
  });

  it('上游无 usage → 使用本地计算值', () => {
    const result = mergeUsage(null, 40, 25);

    expect(result.prompt_tokens).toBe(40);
    expect(result.completion_tokens).toBe(25);
    expect(result.total_tokens).toBe(65);
  });
});

// ============================================================
// countTokens 基础测试
// ============================================================

describe('countTokens', () => {
  it('空文本返回 0', () => {
    expect(countTokens('', 'gpt-4o')).toBe(0);
  });

  it('英文文本计数', () => {
    const tokens = countTokens('Hello world', 'gpt-4o');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10); // "Hello world" ≈ 2 tokens
  });

  it('中文文本计数', () => {
    const tokens = countTokens('你好世界', 'gpt-4o');
    expect(tokens).toBeGreaterThan(0);
  });
});

// ============================================================
// determineStreamBilling 边界 case
// ============================================================

describe('determineStreamBilling 边界', () => {
  it('正常结束但无 usage → 不采信（不应该发生但防御性处理）', () => {
    const state = makeStreamState({
      lastValidUsage: null,
      finishReason: 'stop',
      generatedText: 'Hello',
      totalChunks: 3,
    });

    // 正常结束但无 usage 是边界情况
    // 按当前实现：isAbnormalEnd=false + no usage → 不会进入 A，会 fall through
    // 最终 should not match any case
    const result = determineStreamBilling(state, false, 50, 'gpt-4o');

    // trustUpstream=false, fallback=true 因为没有匹配 A
    expect(result.trustUpstream).toBe(false);
    expect(result.fallback).toBe(true);
  });

  it('异常终止 + 无 usage + 无文本 → 只收输入 token', () => {
    const state = makeStreamState({
      lastValidUsage: null,
      finishReason: null,
      generatedText: '',
      totalChunks: 0,
    });

    const result = determineStreamBilling(state, true, 100, 'gpt-4o');

    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(0);
    expect(result.totalTokens).toBe(100);
    expect(result.trustUpstream).toBe(false);
    expect(result.fallback).toBe(true);
  });
});
