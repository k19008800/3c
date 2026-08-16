/**
 * OpenAI Responses API 兼容端点单元测试 — POST /v1/responses + responses-adapter
 *
 * 纯单测风格（对齐 messages.test.ts / openai-compat.test.ts）：
 * 对 db / fetch / selectChannel / apiKeyAuth 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - responsesToChat：input string → user message
 * - responsesToChat：input 数组角色映射 + instructions 并入 system + developer→system
 * - responsesToChat：max_output_tokens → max_tokens + 其余字段透传
 * - chatToResponses：output 数组结构 + usage 映射 + finish_reason → status
 * - /v1/responses 校验：缺 model → 400；缺 input → 400
 * - /v1/responses 正常路径：selectChannel mock → fetch 调用、上游 URL 以
 *   /v1/chat/completions 结尾、响应经 chatToResponses 转换后透传
 * - /v1/responses 余额 0 → 402
 * - /v1/responses 无可用 channel → mock 回退（Responses 格式占位响应 + 记账）
 * - /v1/responses 流式：上游 chat SSE → Responses SSE 事件序列 + 流式结算
 * - /v1/responses 流式 + 无可用 channel → mock 回退（SSE 事件序列 + streamed 记账）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { responsesRoutes } from '../src/routes/responses';
import { responsesToChat, chatToResponses } from '../src/services/upstream/responses-adapter';

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
  await app.register(responsesRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// ============================================================
// responsesToChat — 纯函数单测
// ============================================================

describe('responsesToChat', () => {
  it('input 为字符串 → 单个 user 消息，model 透传', () => {
    const out = responsesToChat({ model: 'gpt-5', input: 'Tell me a joke' });

    expect(out.model).toBe('gpt-5');
    expect(out.messages).toEqual([{ role: 'user', content: 'Tell me a joke' }]);
  });

  it('input 数组角色映射 + instructions 并入 system + developer → system', () => {
    const out = responsesToChat({
      model: 'gpt-5',
      instructions: 'You are a helpful assistant.',
      input: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'developer', content: 'be concise' },
      ],
    });

    // instructions 并入 messages 开头 role='system'；developer 映射为 system（chat 无此角色）
    expect(out.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'system', content: 'be concise' },
    ]);
  });

  it('input 数组元素为 { type: message } 包装 + 多模态 content 块（input_text→text、input_image→image_url）', () => {
    const out = responsesToChat({
      model: 'gpt-5',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Describe' }, { type: 'input_image', image_url: 'https://example.com/a.png' }] },
      ],
    });

    const messages = out.messages as Array<{ role: string; content: unknown[] }>;
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.content).toEqual([
      { type: 'text', text: 'Describe' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]);
  });

  it('max_output_tokens → max_tokens，temperature/top_p/stream 透传，stream 缺省 false', () => {
    const out = responsesToChat({
      model: 'gpt-5',
      input: 'hi',
      max_output_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
      stream: false,
    });

    expect(out.max_tokens).toBe(200);
    expect(out.max_output_tokens).toBeUndefined();
    expect(out.temperature).toBe(0.7);
    expect(out.top_p).toBe(0.9);
    expect(out.stream).toBe(false);

    const out2 = responsesToChat({ model: 'gpt-5', input: 'hi' });
    expect(out2.stream).toBe(false);
  });
});

// ============================================================
// chatToResponses — 纯函数单测
// ============================================================

describe('chatToResponses', () => {
  it('output 数组结构 + usage 映射 + resp_xxx id + object=response + status=completed', () => {
    const out = chatToResponses(
      {
        id: 'chatcmpl-upstream',
        model: 'upstream-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi there' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      'req-123',
    );

    expect(out.id).toBe('resp_req-123');
    expect(out.object).toBe('response');
    expect(out.status).toBe('completed');
    expect(out.incomplete_details).toBeNull();
    expect(out.model).toBe('upstream-model');
    expect(out.output).toEqual([
      {
        id: 'msg_req-123',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hi there' }],
      },
    ]);
    // usage：prompt_tokens/completion_tokens 映射，total_tokens 为两者之和
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 5, total_tokens: 15 });
  });

  it('finish_reason=length → status=incomplete + incomplete_details=reason max_output_tokens', () => {
    const out = chatToResponses(
      {
        id: 'chatcmpl-x',
        choices: [{ index: 0, message: { role: 'assistant', content: 'partial' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 3, completion_tokens: 9, total_tokens: 12 },
      },
      'req-1',
    );

    expect(out.status).toBe('incomplete');
    expect(out.incomplete_details).toEqual({ reason: 'max_output_tokens' });
  });

  it('content 为空/缺 usage → 空 text + 0 计数；无 requestId → resp_unknown', () => {
    const out = chatToResponses({
      id: 'chatcmpl-y',
      choices: [{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
    });

    expect(out.id).toBe('resp_unknown');
    expect((out.output as Array<{ content: Array<{ text: string }> }>)[0]!.content[0]!.text).toBe('');
    expect(out.usage).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  });
});

// ============================================================
// POST /v1/responses — 请求体校验
// ============================================================

describe('POST /v1/responses 校验', () => {
  it('缺 model → 400 OpenAI error 格式', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { input: 'hi' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('"model" is required');
    expect(res.json().error.type).toBe('invalid_request');
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });

  it('缺 input → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { model: 'gpt-5' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });

  it('input 为空数组 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { model: 'gpt-5', input: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ============================================================
// POST /v1/responses — 流式路径
// ============================================================

describe('POST /v1/responses 流式路径', () => {
  /** 解析 SSE body → 事件数组（event: + data: 成对） */
  function parseSseEvents(body: string): Array<{ event: string; data: Record<string, unknown> }> {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for (const block of body.split('\n\n')) {
      const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (eventLine && dataLine) {
        events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
      }
    }
    return events;
  }

  it('上游 chat SSE → Responses SSE 事件序列（created → deltas → completed），流式结算采信上游 usage', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const sse = [
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
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
      url: '/v1/responses',
      payload: { model: 'gpt-5', input: 'Say hi', stream: true },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/event-stream');

    const events = parseSseEvents(res.body);
    expect(events.map((e) => e.event)).toEqual([
      'response.created',
      'response.in_progress',
      'response.output_item.added',
      'response.content_part.added',
      'response.output_text.delta',
      'response.output_text.delta',
      'response.output_text.done',
      'response.content_part.done',
      'response.output_item.done',
      'response.completed',
    ]);

    // delta 内容按序累积
    const deltas = events.filter((e) => e.event === 'response.output_text.delta').map((e) => e.data.delta);
    expect(deltas).toEqual(['Hello', ' world']);

    // 首个事件：response.created 的 id/object/status
    const created = events[0]!.data as { response: { id: string; object: string; status: string } };
    expect(created.response.id).toMatch(/^resp_/);
    expect(created.response.object).toBe('response');
    expect(created.response.status).toBe('in_progress');

    // 收尾事件：response.completed 含完整 output + usage（采信上游）
    const completed = events.at(-1)!.data as {
      response: {
        status: string;
        usage: Record<string, unknown>;
        output: Array<{ type: string; role: string; content: Array<{ type: string; text: string }> }>;
      };
    };
    expect(completed.response.status).toBe('completed');
    expect(completed.response.usage).toEqual({
      input_tokens: 5,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 2,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 7,
    });
    expect(completed.response.output[0]!.type).toBe('message');
    expect(completed.response.output[0]!.content[0]!.text).toBe('Hello world');

    // 流式结算：streamed=true，采信上游 usage（5 输入 + 2 输出）
    await vi.waitFor(() => {
      expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
        streamed: true,
        trustUpstream: true,
        fallback: false,
        inputTokens: 5,
        outputTokens: 2,
      }));
    });
  });

  it('流式 + 无可用 channel → mock 回退（SSE 事件序列 + streamed 记账）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { model: 'gpt-5', input: 'hi', stream: true },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/event-stream');
    const events = parseSseEvents(res.body);
    expect(events.map((e) => e.event)).toEqual([
      'response.created',
      'response.in_progress',
      'response.output_item.added',
      'response.content_part.added',
      'response.output_text.delta',
      'response.output_text.done',
      'response.content_part.done',
      'response.output_item.done',
      'response.completed',
    ]);
    // mock 记账标记：streamed=true + fallback=true
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      streamed: true,
      fallback: true,
      finishReason: 'stop',
    }));
  });

  it('流式上游中断（读取抛错）→ error 事件 + completed(failed)，仍按已累积文本结算', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    // 只发一个 delta 后抛错的流
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n'));
        controller.error(new Error('connection reset'));
      },
    });
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { model: 'gpt-5', input: 'hi', stream: true },
    });

    expect(res.statusCode).toBe(200);
    const events = parseSseEvents(res.body);
    const names = events.map((e) => e.event);
    expect(names).toContain('error');
    expect(names).toContain('response.completed');
    const completed = events.at(-1)!.data as { response: { status: string; error: { code: string } | null } };
    expect(completed.response.status).toBe('failed');
    expect(completed.response.error?.code).toBe('upstream_error');
    // 无 usage → 本地 tiktoken 兜底（fallback=true），文本累积为 partial
    await vi.waitFor(() => {
      expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
        streamed: true,
        trustUpstream: false,
        fallback: true,
      }));
    });
  });
});

// ============================================================
// POST /v1/responses — 正常路径
// ============================================================

describe('POST /v1/responses 正常路径', () => {
  it('selectChannel 返回 channel → fetch 调用、URL 以 /v1/chat/completions 结尾、响应经 chatToResponses 转换后透传', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(makeUpstreamChatResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-5',
        max_output_tokens: 100,
        instructions: 'You are helpful.',
        input: 'Say hi',
      },
    });

    expect(res.statusCode).toBe(200);
    // fetch 被调用且 URL 以 /v1/chat/completions 结尾
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toMatch(/\/v1\/chat\/completions$/);
    // 上游请求体：OpenAI chat 格式（instructions 并入 system、input 转 user）、model 映射为供应商平台模型名
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.model).toBe('upstream-model');
    expect(sentBody.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(sentBody.messages[1]).toEqual({ role: 'user', content: 'Say hi' });
    expect(sentBody.max_tokens).toBe(100);

    // 响应为 Responses 格式（chatToResponses 转换）
    const body = res.json();
    expect(body.object).toBe('response');
    expect(body.id).toMatch(/^resp_/);
    expect(body.output[0].type).toBe('message');
    expect(body.output[0].role).toBe('assistant');
    expect(body.output[0].content).toEqual([{ type: 'output_text', text: 'Hello from upstream' }]);
    expect(body.usage).toEqual({ input_tokens: 5, output_tokens: 2, total_tokens: 7 });

    // 记账：model 用用户请求的模型；streamed=false、trustUpstream=true（采信上游 usage）
    expect(mocks.balance.deductBalance).toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5',
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
      url: '/v1/responses',
      payload: { model: 'gpt-5', input: 'hi' },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.type).toBe('insufficient_balance');
    expect(res.json().error.code).toBe(402);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('无可用 channel → mock 回退（Responses 格式占位响应 + 记账）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { model: 'gpt-5', input: 'hello world' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.object).toBe('response');
    expect(body.id).toMatch(/^resp_/);
    expect(body.status).toBe('completed');
    expect(body.output[0].type).toBe('message');
    expect(body.output[0].content[0].type).toBe('output_text');
    expect(body.output[0].content[0].text).toContain('[3cloud 模拟响应]');
    expect(body.usage.output_tokens).toBeGreaterThan(0);
    expect(body.usage.input_tokens).toBeGreaterThan(0);
    // 未请求上游
    expect(mocks.fetch).not.toHaveBeenCalled();
    // mock 回退记账标记：fallback=true、trustUpstream=false、streamed=false
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5',
      streamed: false,
      trustUpstream: false,
      fallback: true,
      finishReason: 'stop',
    }));
  });
});
