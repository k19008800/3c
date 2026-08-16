/**
 * Anthropic 兼容层测试 — 翻译纯函数 + 流式事件序列
 *
 * 覆盖：
 * - translateAnthropicRequest：Anthropic 请求 → OpenAI 请求（system / 内容块 / tool / 非法请求）
 * - mapStopReason / openaiToAnthropicMessage：OpenAI 响应 → Anthropic Messages
 * - extractOpenAIChunk + 事件构建器
 * - anthropicStreamRelay：OpenAI SSE → Anthropic 事件序列 + StreamState 累积
 */

import { describe, it, expect } from 'vitest';
import {
  translateAnthropicRequest,
  openaiToAnthropicMessage,
  mapStopReason,
  extractOpenAIChunk,
  anthropicMessageStartEvent,
  anthropicContentBlockStart,
  anthropicContentBlockDelta,
  anthropicContentBlockStop,
  anthropicMessageDelta,
  anthropicMessageStop,
} from '../src/services/anthropic/translate.js';
import { anthropicStreamRelay } from '../src/services/anthropic/stream-relay.js';

// ============================================================
// 请求翻译：Anthropic → OpenAI
// ============================================================

describe('translateAnthropicRequest', () => {
  it('1. 基础请求：文本消息 + 参数透传', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.9,
      stop_sequences: ['\n\n'],
      stream: true,
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(out.model).toBeUndefined(); // 只含翻译结果，model 由路由层取
    expect(out.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(out.stream).toBe(true);
    expect(out.max_tokens).toBe(1024);
    expect(out.temperature).toBe(0.7);
    expect(out.top_p).toBe(0.9);
    expect(out.stop).toEqual(['\n\n']);
  });

  it('2. system 字符串 → 首条 system 消息', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      system: 'You are helpful',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(out.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
    expect(out.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('3. system 内容块数组 → 拼接文本', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      system: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }],
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(out.messages[0]!.content).toBe('A\nB');
  });

  it('4. 内容块：text + image(base64) → OpenAI 多模态 content', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
        ],
      }],
    });
    const content = out.messages[0]!.content as unknown[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: '看图' });
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
  });

  it('5. 内容块：image(url) → OpenAI image_url(url)', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://x.com/a.png' } }] }],
    });
    const content = out.messages[0]!.content as unknown[];
    expect(content[0]).toEqual({ type: 'image_url', image_url: { url: 'https://x.com/a.png' } });
  });

  it('6. tool_use → OpenAI tool_calls；tool_result → role=tool 消息', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'beijing' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '晴' }],
        },
      ],
    });

    expect(out.messages[0]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'toolu_1',
        type: 'function',
        function: { name: 'get_weather', arguments: JSON.stringify({ city: 'beijing' }) },
      }],
    });
    expect(out.messages[1]).toEqual({ role: 'tool', tool_call_id: 'toolu_1', content: '晴' });
  });

  it('7. tools（input_schema）→ OpenAI tools（function.parameters）', () => {
    const out = translateAnthropicRequest({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [{
        name: 'get_weather',
        description: '查询天气',
        input_schema: { type: 'object', properties: { city: { type: 'string' } } },
      }],
    });
    expect(out.tools).toEqual([{
      type: 'function',
      function: {
        name: 'get_weather',
        description: '查询天气',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
    }]);
  });

  it('8. 非法请求：缺 model / 空 messages / 非法 role → 抛错', () => {
    expect(() => translateAnthropicRequest({ messages: [{ role: 'user', content: 'Hi' }] })).toThrow('"model" is required');
    expect(() => translateAnthropicRequest({ model: 'm', messages: [] })).toThrow('"messages" is required');
    expect(() => translateAnthropicRequest({ model: 'm', messages: [{ role: 'system', content: 'x' }] })).toThrow('Unsupported message role');
  });
});

// ============================================================
// 响应翻译：OpenAI → Anthropic
// ============================================================

describe('openaiToAnthropicMessage / mapStopReason', () => {
  it('9. finish_reason 映射：stop→end_turn / length→max_tokens / tool_calls→tool_use', () => {
    expect(mapStopReason('stop')).toBe('end_turn');
    expect(mapStopReason('length')).toBe('max_tokens');
    expect(mapStopReason('tool_calls')).toBe('tool_use');
    expect(mapStopReason(null)).toBe('end_turn');
    expect(mapStopReason(undefined)).toBe('end_turn');
  });

  it('10. OpenAI 响应 → Anthropic Messages（文本 + usage + stop_reason）', () => {
    const payload = {
      choices: [{ message: { content: '你好' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
    const msg = openaiToAnthropicMessage(payload, 'deepseek-chat', 'req-1');
    expect(msg.id).toBe('msg_req-1');
    expect(msg.type).toBe('message');
    expect(msg.role).toBe('assistant');
    expect(msg.model).toBe('deepseek-chat');
    expect(msg.content).toEqual([{ type: 'text', text: '你好' }]);
    expect(msg.stop_reason).toBe('end_turn');
    expect(msg.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
  });

  it('11. 无 usage / 无 content 时兜底 0 / 空串', () => {
    const msg = openaiToAnthropicMessage({ choices: [{ message: {}, finish_reason: 'length' }] }, 'm', 'req-2');
    expect(msg.content).toEqual([{ type: 'text', text: '' }]);
    expect(msg.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(msg.stop_reason).toBe('max_tokens');
  });
});

// ============================================================
// 流式 chunk 提取 + 事件构建
// ============================================================

describe('extractOpenAIChunk / 事件构建', () => {
  it('12. 提取文本增量 / finish_reason / usage', () => {
    const r = extractOpenAIChunk({
      choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
    });
    expect(r.text).toBe('Hi');
    expect(r.finishReason).toBeNull();
    expect(r.usage).toBeNull();

    const r2 = extractOpenAIChunk({
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    });
    expect(r2.finishReason).toBe('stop');
    expect(r2.usage).toEqual({ prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 });
  });

  it('13. 事件构建器输出 Anthropic 事件形状', () => {
    expect(anthropicMessageStartEvent('msg_1', 'm', 10)).toEqual({
      type: 'message_start',
      message: {
        id: 'msg_1', type: 'message', role: 'assistant', model: 'm',
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    });
    expect(anthropicContentBlockStart(0)).toEqual({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    expect(anthropicContentBlockDelta(0, 'Hi')).toEqual({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } });
    expect(anthropicContentBlockStop(0)).toEqual({ type: 'content_block_stop', index: 0 });
    expect(anthropicMessageDelta('end_turn', 7)).toEqual({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 7 },
    });
    expect(anthropicMessageStop()).toEqual({ type: 'message_stop' });
  });
});

// ============================================================
// 流式转发：OpenAI SSE → Anthropic 事件序列
// ============================================================

function makeSSEResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function makeFakeReply() {
  const writes: string[] = [];
  return {
    raw: {
      write: (s: string) => { writes.push(s); },
      end: () => { writes.push('[END]'); },
      writeHead: () => {},
    },
    writes,
  };
}

describe('anthropicStreamRelay', () => {
  it('14. 完整流：事件序列 message_start → deltas → message_delta → message_stop', async () => {
    const ctx = { requestId: 'req-1' } as any;
    const reply = makeFakeReply() as any;
    const upstream = makeSSEResponse([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":3,"total_tokens":11}}\n\n',
      'data: [DONE]\n\n',
    ]);

    const state = await anthropicStreamRelay(ctx, reply, upstream, { messageId: 'msg_1', model: 'deepseek-chat', inputTokens: 8 });

    const text = reply.writes.join('');
    // 事件序列（含 data 行）
    expect(text).toContain('event: message_start');
    expect(text).toContain('event: content_block_start');
    expect(text).toContain('event: content_block_delta');
    expect(text).toContain('"delta":{"type":"text_delta","text":"你"}');
    expect(text).toContain('"delta":{"type":"text_delta","text":"好"}');
    expect(text).toContain('event: content_block_stop');
    expect(text).toContain('event: message_delta');
    expect(text).toContain('"stop_reason":"end_turn"');
    expect(text).toContain('"output_tokens":3');
    expect(text).toContain('event: message_stop');
    // 事件顺序：message_start 在最前，message_stop 在最后
    expect(text.indexOf('event: message_start')).toBeLessThan(text.indexOf('event: content_block_start'));
    expect(text.indexOf('event: content_block_stop')).toBeLessThan(text.indexOf('event: message_delta'));
    expect(text.indexOf('event: message_delta')).toBeLessThan(text.indexOf('event: message_stop'));

    // StreamState 累积
    expect(state.generatedText).toBe('你好');
    expect(state.finishReason).toBe('stop');
    expect(state.lastValidUsage).toEqual({ prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 });
    expect(state.totalChunks).toBe(3);
  });

  it('15. 无文本流（直接 finish）：仍发收尾事件且不崩溃', async () => {
    const ctx = { requestId: 'req-2' } as any;
    const reply = makeFakeReply() as any;
    const upstream = makeSSEResponse([
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const state = await anthropicStreamRelay(ctx, reply, upstream, { messageId: 'msg_2', model: 'm', inputTokens: 4 });
    const text = reply.writes.join('');
    expect(text).toContain('event: message_delta');
    expect(text).toContain('"stop_reason":"max_tokens"');
    expect(text).toContain('event: message_stop');
    expect(state.generatedText).toBe('');
    expect(state.finishReason).toBe('length');
  });

  it('16. 中断后仍输出收尾事件（状态保留已累积数据）', async () => {
    const ctx = { requestId: 'req-3' } as any;
    const reply = makeFakeReply() as any;
    // 上游第 1 个 chunk 已交付，随后读中断 → 模拟流中断
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'));
        setTimeout(() => controller.error(new Error('upstream disconnect')), 5);
      },
    });
    const upstream = new Response(body, { status: 200 });

    let threw = false;
    try {
      await anthropicStreamRelay(ctx, reply, upstream, { messageId: 'msg_3', model: 'm', inputTokens: 4 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true); // 中断错误向上抛（与 proxy.ts 语义一致）
    const text = reply.writes.join('');
    expect(text).toContain('event: message_start');
    expect(text).toContain('event: content_block_delta');
    // 中断也补发收尾事件，客户端 SDK 不悬挂
    expect(text).toContain('event: message_delta');
    expect(text).toContain('event: message_stop');
    expect(text.endsWith('[END]')).toBe(true); // 连接已关闭
  });
});
