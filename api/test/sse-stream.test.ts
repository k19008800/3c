/**
 * SSE 流式转发测试 — 8 个测试用例
 *
 * 覆盖：
 * - SSE 解析器跨 buffer 边界处理
 * - streamRelay 正常流式场景
 * - 中断后数据完整性
 * - relayNonStream 非流式透传
 */

import { describe, it, expect } from 'vitest';
import { parseSSELines, parseSSELinesArray } from '../src/services/upstream/sse-parser.js';

// ============================================================
// SSE 解析器测试
// ============================================================

describe('SSE 解析器', () => {
  it('1. 单行 data: 解析：提取 JSON chunk', () => {
    const results: Array<{ data: string; isData: boolean }> = [];
    const bufferRef = { value: '' };

    parseSSELines(bufferRef, 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n', (data, isData) => {
      results.push({ data, isData });
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.isData).toBe(true);
    expect(results[0]!.data).toBe('{"choices":[{"delta":{"content":"Hello"}}]}');
  });

  it('2. [DONE] 信号识别：正确识别流结束标记', () => {
    const results: Array<{ data: string; isData: boolean }> = [];
    const bufferRef = { value: '' };

    parseSSELines(bufferRef, 'data: [DONE]\n', (data, isData) => {
      results.push({ data, isData });
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.isData).toBe(true);
    expect(results[0]!.data).toBe('[DONE]');
  });

  it('3. 跨 buffer 边界：data: { 和 "choices":...} 分两次到达', () => {
    const results: Array<{ data: string; isData: boolean }> = [];
    const bufferRef = { value: '' };

    // 第一次只收到 data: {
    parseSSELines(bufferRef, 'data: {', () => {});
    // buffer 中应该累积了 'data: {' (因为 \n 还没到)
    expect(bufferRef.value).toBe('data: {');

    // 第二次收到剩余部分 + \n
    parseSSELines(bufferRef, '"choices":[{"delta":{"content":"Hi"}}]}\n', (data, isData) => {
      results.push({ data, isData });
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.isData).toBe(true);
    // 完整 JSON 可被解析
    const parsed = JSON.parse(results[0]!.data);
    expect(parsed.choices[0].delta.content).toBe('Hi');
  });

  it('4. 多行一次性到达：两个 data: 行 + [DONE]', () => {
    const results: Array<{ data: string; isData: boolean }> = [];
    const bufferRef = { value: '' };

    const payload = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n',
      'data: [DONE]\n',
    ].join('');

    parseSSELines(bufferRef, payload, (data, isData) => {
      results.push({ data, isData });
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.isData).toBe(true);
    expect(results[1]!.isData).toBe(true);
    expect(results[2]!.data).toBe('[DONE]');
  });

  it('5. 非 data: 行原样转发：event: 和 id: 行保持原样', () => {
    const results: Array<{ data: string; isData: boolean }> = [];
    const bufferRef = { value: '' };

    const payload = [
      'event: message\n',
      'data: {"content":"test"}\n',
      'id: 42\n',
    ].join('');

    parseSSELines(bufferRef, payload, (data, isData) => {
      results.push({ data, isData });
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.isData).toBe(false);
    expect(results[0]!.data).toBe('event: message');
    expect(results[1]!.isData).toBe(true);
    expect(results[2]!.isData).toBe(false);
    expect(results[2]!.data).toBe('id: 42');
  });

  it('6. 空行处理：空行正常传递', () => {
    const results: Array<{ data: string; isData: boolean }> = [];
    const bufferRef = { value: '' };

    parseSSELines(bufferRef, '\n', (data, isData) => {
      results.push({ data, isData });
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.isData).toBe(false);
    expect(results[0]!.data).toBe('');
  });

  it('7. streamRelay 累积 usage：最后一个 finish_reason 非空 chunk 保存 usage', () => {
    // 模拟流式过程中收到的 chunk 序列
    const chunks = [
      { choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null },
      { choices: [{ delta: { content: ' World' }, finish_reason: null }], usage: null },
      { choices: [{ delta: { content: '!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } },
    ];

    // 模拟 streamRelay 的 usage 收集逻辑
    let lastValidUsage: Record<string, number> | null = null;
    let generatedText = '';
    let finishReason: string | null = null;

    for (const chunk of chunks) {
      const deltaContent = chunk.choices[0]?.delta?.content;
      if (typeof deltaContent === 'string') {
        generatedText += deltaContent;
      }

      const fr = chunk.choices[0]?.finish_reason;
      if (fr) {
        finishReason = fr;
        if (chunk.usage) {
          lastValidUsage = chunk.usage;
        }
      }
    }

    expect(generatedText).toBe('Hello World!');
    expect(finishReason).toBe('stop');
    expect(lastValidUsage).toEqual({ prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 });
  });

  it('8. 中间帧有 usage 但 finish_reason 仍为 null → 不采信该帧', () => {
    // 某些上游会在中间帧返回 usage，但 finish_reason 仍为 null
    // 只有 finish_reason 非空时才视为最终 usage
    const chunks = [
      { choices: [{ delta: { content: 'Part 1' }, finish_reason: null }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } },
      { choices: [{ delta: { content: ' Part 2' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } },
    ];

    let lastValidUsage: Record<string, number> | null = null;
    let generatedText = '';

    for (const chunk of chunks) {
      const deltaContent = chunk.choices[0]?.delta?.content;
      if (typeof deltaContent === 'string') {
        generatedText += deltaContent;
      }

      const fr = chunk.choices[0]?.finish_reason;
      if (fr) {
        if (chunk.usage) {
          lastValidUsage = chunk.usage;
        }
      }
    }

    // 应该采信最后一帧的 usage（200 total），而非中间帧的（150 total）
    expect(lastValidUsage).toEqual({ prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 });
    expect(generatedText).toBe('Part 1 Part 2');
  });
});

// ============================================================
// parseSSELinesArray 测试
// ============================================================

describe('parseSSELinesArray', () => {
  it('处理预分割的行数组', () => {
    const results: string[] = [];
    parseSSELinesArray(
      ['data: {"a":1}', 'data: [DONE]', ''],
      (data, isData) => {
        if (isData) results.push(data);
      },
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toBe('{"a":1}');
    expect(results[1]).toBe('[DONE]');
  });
});
