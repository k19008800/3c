/**
 * Anthropic Messages API 兼容端点单元测试 — POST /v1/messages + claude-adapter
 *
 * 纯单测风格（对齐 openai-compat.test.ts / key-selector.test.ts）：
 * 对 db / fetch / selectChannel / apiKeyAuth 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - claudeToOpenAI：基础转换（system 并入、角色映射、max_tokens/stream 透传）
 * - claudeToOpenAI：content blocks 数组 → OpenAI 多模态数组
 * - openAIToClaude：content 提取 + usage 字段映射
 * - /v1/messages 校验：缺 model → 400；缺 messages → 400
 * - /v1/messages 正常路径：selectChannel mock → fetch 调用、上游 URL 以
 *   /v1/chat/completions 结尾、响应经 openAIToClaude 转换后透传
 * - /v1/messages 余额 0 → 402
 * - /v1/messages 无可用 channel → mock 回退（Claude 格式占位响应 + 记账）
 * - /v1/messages 流式 → SSE 转发
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { messagesRoutes } from '../src/routes/messages';
import { claudeToOpenAI, openAIToClaude } from '../src/services/upstream/claude-adapter';

// ============================================================
// Module mocks（vi.hoisted 保证 factory 可引用）
// ============================================================

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn() },
  routing: { selectChannel: vi.fn() },
  balance: { getBalance: vi.fn(), deductBalance: vi.fn() },
  consumption: { recordConsumption: vi.fn() },
  circuitBreaker: { recordChannelResult: vi.fn() },
  commission: { generateCommissionForConsumption: vi.fn() },
  apikey: { apiKeyAuth: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock('../src/db', () => ({
  db: mocks.db,
  // 只提供路由代码会访问的列占位对象（eq 只构造 SQL 对象，不真正执行）
  schema: {
    vendorPricing: { inputPrice: {}, outputPrice: {}, supplierModelId: {}, status: {} },
    supplierModels: { id: {}, modelName: {}, platformModel: {}, supplierId: {}, status: {} },
    suppliers: { id: {}, name: {}, status: {} },
    apiKeys: { id: {}, lastUsedAt: {} },
  },
}));
vi.mock('../src/services/upstream/routing', () => ({ selectChannel: mocks.routing.selectChannel }));
vi.mock('../src/services/upstream/circuit-breaker', () => ({
  recordChannelResult: mocks.circuitBreaker.recordChannelResult,
  isCircuitOpen: vi.fn().mockResolvedValue(false),
}));
vi.mock('../src/services/billing/balance', () => ({
  getBalance: mocks.balance.getBalance,
  deductBalance: mocks.balance.deductBalance,
  addBalance: vi.fn(),
  initBalance: vi.fn(),
}));
vi.mock('../src/services/billing/consumption-log', () => ({
  recordConsumption: mocks.consumption.recordConsumption,
  getUserConsumptionStats: vi.fn(),
}));
vi.mock('../src/services/agent/commission', () => ({
  generateCommissionForConsumption: mocks.commission.generateCommissionForConsumption,
}));
vi.mock('../src/services/auth/apikey', () => ({
  apiKeyAuth: mocks.apikey.apiKeyAuth,
  hashApiKey: vi.fn(),
  extractApiKeyFromHeader: vi.fn(),
  verifyApiKey: vi.fn(),
}));

// ============================================================
// Test helpers
// ============================================================

/** 构造 selectChannel 返回的 channel（供应商 baseUrl 固定 https://upstream.test） */
function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    supplier: { id: 1, name: 'Test Supplier', code: 'test', baseUrl: 'https://upstream.test', status: 'active', healthStatus: null },
    key: { id: 7, supplierId: 1, keyValue: 'sk-upstream', name: 'k1', status: 'active', selectMode: 'single', priority: 1, currentBalance: null },
    modelMapping: { id: 3, supplierId: 1, modelName: 'test-model', platformModel: 'upstream-model', status: 'active' },
    ...overrides,
  };
}

/**
 * 让 db.select 返回定价查询链（select → from → innerJoin → where → limit），
 * 默认解析为空数组（走默认单价）；传函数时按函数返回值处理。
 */
function mockDbPricing(result: unknown[] | (() => Promise<unknown[]>) = []) {
  const limit = vi.fn();
  if (typeof result === 'function') {
    limit.mockImplementation(result);
  } else {
    limit.mockResolvedValue(result);
  }
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit }),
      }),
    }),
  });
}

/** 让 db.update 返回完整更新链（update → set → where） */
function mockDbUpdate() {
  mocks.db.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

/** OpenAI 格式上游非流式响应（chat/completions） */
function makeUpstreamChatResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-upstream',
    object: 'chat.completion',
    created: 1700000000,
    model: 'upstream-model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from upstream' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    ...overrides,
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  // apiKeyAuth 直接放行并注入上下文（绕过真实 DB 校验）
  mocks.apikey.apiKeyAuth.mockImplementation(async (request: any) => {
    request.apiKeyContext = { userId: 1, apiKeyId: 11, keyHash: 'test-hash' };
  });

  // 默认余额充足 + 记账成功 + 定价走默认价
  mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
  mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
  mocks.consumption.recordConsumption.mockResolvedValue({ id: 1 });
  mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
  mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
  mockDbPricing();
  mockDbUpdate();

  // fetch 全局 stub
  vi.stubGlobal('fetch', mocks.fetch);

  app = Fastify();
  await app.register(messagesRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// ============================================================
// claudeToOpenAI — 纯函数单测
// ============================================================

describe('claudeToOpenAI', () => {
  it('基础转换：system 并入 messages 开头、角色映射、max_tokens/temperature/stream 透传', () => {
    const out = claudeToOpenAI({
      model: 'claude-3-5-sonnet',
      max_tokens: 200,
      temperature: 0.7,
      stream: true,
      system: 'You are a helpful assistant.',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });

    expect(out.model).toBe('claude-3-5-sonnet');
    expect(out.max_tokens).toBe(200);
    expect(out.temperature).toBe(0.7);
    expect(out.stream).toBe(true);
    // system 并入 messages 开头 role='system'
    expect(out.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('stream 缺省 → 默认 false', () => {
    const out = claudeToOpenAI({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out.stream).toBe(false);
  });

  it('content blocks 数组 → OpenAI 多模态数组（text→string、image→image_url、无法映射原样透传）', () => {
    const toolUseBlock = { type: 'tool_use', id: 't1', name: 'get_weather', input: { city: 'beijing' } };
    const out = claudeToOpenAI({
      model: 'claude-3-5-sonnet',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } },
            toolUseBlock,
          ],
        },
      ],
    });

    const content = (out.messages as Array<{ content: unknown[] }>)[0]!.content;
    expect(content[0]).toBe('Describe this image'); // text block → string
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }); // url image
    expect(content[2]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,aGVsbG8=' },
    }); // base64 image → data URL
    expect(content[3]).toBe(toolUseBlock); // 无法映射 → 原样透传
  });

  it('system 为 blocks 数组 → 取 text 拼接为 system 消息', () => {
    const out = claudeToOpenAI({
      model: 'm',
      system: [
        { type: 'text', text: 'Part one.' },
        { type: 'text', text: 'Part two.' },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect((out.messages as Array<{ role: string; content: string }>)[0]).toEqual({
      role: 'system',
      content: 'Part one.\nPart two.',
    });
  });
});

// ============================================================
// openAIToClaude — 纯函数单测
// ============================================================

describe('openAIToClaude', () => {
  it('content 提取 + usage 字段映射 + msg_xxx id + stop_reason 映射', () => {
    const out = openAIToClaude(
      {
        id: 'chatcmpl-upstream',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi there' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      'claude-3-5-sonnet',
      'req-123',
    );

    expect(out.id).toBe('msg_req-123');
    expect(out.type).toBe('message');
    expect(out.role).toBe('assistant');
    expect(out.model).toBe('claude-3-5-sonnet');
    expect(out.content).toEqual([{ type: 'text', text: 'Hi there' }]);
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(out.stop_reason).toBe('end_turn');
  });

  it('finish_reason=length → stop_reason=max_tokens；无 requestId 时保留上游 id', () => {
    const out = openAIToClaude(
      {
        id: 'chatcmpl-abc',
        choices: [{ index: 0, message: { role: 'assistant', content: 'partial' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 3, completion_tokens: 9, total_tokens: 12 },
      },
      'claude-3-5-sonnet',
    );

    expect(out.id).toBe('chatcmpl-abc');
    expect(out.stop_reason).toBe('max_tokens');
    expect(out.usage).toEqual({ input_tokens: 3, output_tokens: 9 });
  });

  it('content 为空 → 空 blocks 数组；缺 usage → 0 计数', () => {
    const out = openAIToClaude(
      {
        id: 'chatcmpl-x',
        choices: [{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
      },
      'claude-3-5-sonnet',
      'req-1',
    );
    expect(out.content).toEqual([]);
    expect(out.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });
});

// ============================================================
// POST /v1/messages — 请求体校验
// ============================================================

describe('POST /v1/messages 校验', () => {
  it('缺 model → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().type).toBe('error');
    expect(res.json().error.type).toBe('invalid_request');
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });

  it('缺 messages → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-3-5-sonnet', max_tokens: 100 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
  });

  it('messages 为空数组 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-3-5-sonnet', messages: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ============================================================
// POST /v1/messages — 正常路径
// ============================================================

describe('POST /v1/messages 正常路径', () => {
  it('selectChannel 返回 channel → fetch 调用、URL 以 /v1/chat/completions 结尾、响应经 openAIToClaude 转换后透传', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(makeUpstreamChatResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: {
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Say hi' }],
      },
    });

    expect(res.statusCode).toBe(200);
    // fetch 被调用且 URL 以 /v1/chat/completions 结尾
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toMatch(/\/v1\/chat\/completions$/);
    // 上游请求体：OpenAI 格式（system 并入）、model 映射为供应商平台模型名
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.model).toBe('upstream-model');
    expect(sentBody.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(sentBody.messages[1]).toEqual({ role: 'user', content: 'Say hi' });
    expect(sentBody.max_tokens).toBe(100);

    // 响应为 Claude 格式（openAIToClaude 转换）
    const body = res.json();
    expect(body.type).toBe('message');
    expect(body.role).toBe('assistant');
    expect(body.content).toEqual([{ type: 'text', text: 'Hello from upstream' }]);
    expect(body.usage).toEqual({ input_tokens: 5, output_tokens: 2 }); // prompt_tokens/completion_tokens 映射
    expect(body.model).toBe('claude-3-5-sonnet');

    // 记账：model 用用户请求的模型；streamed=false、trustUpstream=true（采信上游 usage）
    expect(mocks.balance.deductBalance).toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-3-5-sonnet',
      streamed: false,
      trustUpstream: true,
      fallback: false,
      inputTokens: 5,
      outputTokens: 2,
    }));
  });

  it('余额为 0 → 402，且不发起上游调用', async () => {
    mocks.balance.getBalance.mockResolvedValue({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', currency: 'CNY' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().type).toBe('error');
    expect(res.json().error.type).toBe('insufficient_balance');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('无可用 channel → mock 回退（Claude 格式占位响应 + 记账）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'hello world' }] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.type).toBe('message');
    expect(body.role).toBe('assistant');
    expect(body.content[0].type).toBe('text');
    expect(body.content[0].text).toContain('[3cloud 模拟响应]');
    expect(body.usage.output_tokens).toBeGreaterThan(0);
    expect(body.id).toMatch(/^msg_/);
    // 未请求上游
    expect(mocks.fetch).not.toHaveBeenCalled();
    // mock 回退记账标记：fallback=true、trustUpstream=false、streamed=false
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-3-5-sonnet',
      streamed: false,
      trustUpstream: false,
      fallback: true,
      finishReason: 'stop',
    }));
  });

  it('流式 → SSE 转发（假上游 Response 流）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: {
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'Say hi' }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/event-stream');
    expect(res.body).toContain('data: [DONE]');
    expect(res.body).toContain('"content":"Hello"');

    // 流式结算：streamed=true，采信上游 usage（5 输入 + 2 输出）
    await vi.waitFor(() => {
      expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
        model: 'claude-3-5-sonnet',
        streamed: true,
        trustUpstream: true,
        fallback: false,
        inputTokens: 5,
        outputTokens: 2,
      }));
    });
  });
});
