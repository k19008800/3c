/**
 * WebSocket 流式转发单元测试 — relayWebSocket + handleWsConnection
 *
 * 纯单测风格（对齐 key-selector.test.ts / openai-compat.test.ts）：
 * - mock ws 客户端 socket / 上游 WS socket / fetch / selectChannel / getBalance / 定时器
 * - 不依赖真实 WS 服务器、PG、Redis、网络
 *
 * 覆盖（任务要求 8 项）：
 * - 消息解析：首条消息含 model/messages → 正确提取；非法 JSON / 缺 model / 空 messages → 400
 * - 鉴权失败：query key 无效 / 首条消息 key 无效 / 无 key → error 帧 + 关闭 + 不建立转发
 * - 余额 0 → 402 错误消息（WS 内）
 * - 正常转发（方案 B）：上游 mock 返回 SSE → 客户端 socket 收到包装后的消息帧
 * - 上游断开（无 [DONE]）→ 客户端收到结束消息 + 结算被调用
 * - 结算：有 usage → trustUpstream=true（采信）；异常无 usage → fallback
 * - 心跳定时器被设置（mock 定时器断言 setInterval(30000) + ping + clearInterval）
 * - selectChannel 返回 null → mock 回退占位响应
 * 附加：方案 A 上游 WS 双向透传、客户端断开未结算按已收 chunk 结算
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { relayWebSocket, parseFirstMessage, relayStreamToSocket, wsErrorFrame } from '../src/services/upstream/ws-relay';
import { handleWsConnection } from '../src/routes/ws';
import { AppError } from '../src/lib/errors';

// ============================================================
// Module mocks（vi.hoisted 保证 factory 可引用）
// ============================================================

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  routing: { selectChannel: vi.fn() },
  circuitBreaker: { recordChannelResult: vi.fn() },
  balance: { getBalance: vi.fn(), deductBalance: vi.fn() },
  consumption: { recordConsumption: vi.fn() },
  commission: { generateCommissionForConsumption: vi.fn() },
  apikey: { verifyApiKey: vi.fn(), extractApiKeyFromHeader: vi.fn(), hashApiKey: vi.fn() },
}));

vi.mock('../src/db', () => ({
  db: mocks.db,
  // 只提供 ws-relay 可能访问的列占位对象（eq 只构造 SQL 节点，不真正执行）
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
  isCircuitOpen: vi.fn(),
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
  verifyApiKey: mocks.apikey.verifyApiKey,
  extractApiKeyFromHeader: mocks.apikey.extractApiKeyFromHeader,
  hashApiKey: mocks.apikey.hashApiKey,
}));

// ============================================================
// Test helpers
// ============================================================

/** 模拟客户端 WS socket（EventEmitter + send/close/ping） */
function makeSocket() {
  const socket = new EventEmitter() as any;
  socket.send = vi.fn();
  socket.close = vi.fn();
  socket.ping = vi.fn();
  socket.readyState = 1; // OPEN
  return socket;
}

/** 模拟上游 WS socket（方案 A） */
function makeUpstreamSocket() {
  const upstream = new EventEmitter() as any;
  upstream.send = vi.fn();
  upstream.close = vi.fn();
  upstream.readyState = 1; // OPEN
  return upstream;
}

/** 构造 selectChannel 返回的 channel（baseUrl 为 https → 方案 B） */
function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    supplier: { id: 1, name: 'Test Supplier', code: 'test', baseUrl: 'https://upstream.test', status: 'active', healthStatus: null },
    key: { id: 7, supplierId: 1, keyValue: 'sk-upstream', name: 'k1', status: 'active', selectMode: 'single', priority: 1, currentBalance: null },
    modelMapping: { id: 3, supplierId: 1, modelName: 'test-model', platformModel: 'upstream-model', status: 'active' },
    ...overrides,
  };
}

/** 构造可注入依赖（determineStreamBilling 不注入 → 走真实纯函数） */
function makeDeps(overrides: Record<string, any> = {}) {
  const timers = {
    setInterval: vi.fn(() => 42),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(() => 43),
    clearTimeout: vi.fn(),
  };
  return {
    timers,
    now: vi.fn(() => 1_000_000),
    getBalance: vi.fn().mockResolvedValue({ availableBalance: '100' }),
    selectChannel: vi.fn().mockResolvedValue(makeChannel()),
    settleBilling: vi.fn().mockResolvedValue(undefined),
    getPricingForModel: vi.fn().mockResolvedValue({ input: 0.002, output: 0.008 }),
    fetchImpl: vi.fn(),
    connectUpstreamWs: vi.fn(),
    buildUpstreamWsUrl: vi.fn((c: any) => `wss://${c.supplier.baseUrl}/v1/ws`),
    mode: 'auto',
    heartbeatIntervalMs: 30_000,
    idleTimeoutMs: 60_000,
    recordChannelResult: vi.fn().mockResolvedValue({ shouldBan: false }),
    ...overrides,
  };
}

/** 直接调用 relayWebSocket 的便捷封装 */
function runRelay(socket: any, rawFirstMessage: string, deps: Record<string, any>, ctx = { userId: 1, apiKeyId: 2, keyHash: 'hash' }) {
  return relayWebSocket({ socket, rawFirstMessage, ctx, deps: deps as any });
}

/** 构造 SSE 上游响应体 */
function sseResponse(lines: string[]): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.join('')));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

/** 刷新微任务 + macrotask（事件回调异步收尾用） */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const VALID_FIRST_MESSAGE = JSON.stringify({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'hi' }],
  stream: true,
});

const SSE_NORMAL = [
  'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n',
  'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n',
  'data: [DONE]\n',
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// 1. 消息解析
// ============================================================

describe('parseFirstMessage — 消息解析', () => {
  it('首条消息含 model/messages → 正确提取（含 stream 默认值）', () => {
    const parsed = parseFirstMessage(VALID_FIRST_MESSAGE);
    expect(parsed.model).toBe('gpt-4o');
    expect(parsed.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(parsed.stream).toBe(true);
  });

  it('未指定 stream → 提取为 undefined（relay 内按 true 处理）', () => {
    const parsed = parseFirstMessage(JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }));
    expect(parsed.model).toBe('gpt-4o');
    expect(parsed.stream).toBeUndefined();
  });

  it('非法 JSON → 抛 AppError 400', () => {
    expect(() => parseFirstMessage('not-json')).toThrow(AppError);
    try {
      parseFirstMessage('not-json');
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('缺 model → 抛 AppError 400', () => {
    expect(() => parseFirstMessage(JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }))).toThrow(/model/);
  });

  it('messages 为空数组 → 抛 AppError 400', () => {
    expect(() => parseFirstMessage(JSON.stringify({ model: 'gpt-4o', messages: [] }))).toThrow(/messages/);
  });

  it('relayWebSocket 收到非法首条消息 → 400 错误帧 + 关闭 + 不选路', async () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const result = await runRelay(socket, 'not-json', deps);
    expect(JSON.parse(socket.send.mock.calls[0][0]).error.code).toBe(400);
    expect(socket.close).toHaveBeenCalled();
    expect(deps.selectChannel).not.toHaveBeenCalled();
    expect(result.settled).toBe(false);
  });
});

// ============================================================
// 2. 鉴权（handleWsConnection）
// ============================================================

describe('handleWsConnection — 鉴权失败不建立转发', () => {
  it('query key 无效（握手期 wsAuthError）→ error 帧 + 关闭 + 不转发', async () => {
    const socket = makeSocket();
    const relayImpl = vi.fn().mockResolvedValue(undefined);
    await handleWsConnection(socket, { wsAuthError: { code: 401, message: 'Invalid API key', type: 'invalid_request_error' } }, { relayImpl });
    expect(JSON.parse(socket.send.mock.calls[0][0]).error.message).toBe('Invalid API key');
    expect(socket.close).toHaveBeenCalledWith(4001, 'auth_failed');
    expect(relayImpl).not.toHaveBeenCalled();
  });

  it('首条消息携带的 api_key 无效 → error 帧 + 关闭 + 不转发', async () => {
    mocks.apikey.verifyApiKey.mockResolvedValue(null);
    const socket = makeSocket();
    const relayImpl = vi.fn().mockResolvedValue(undefined);
    const promise = handleWsConnection(socket, {}, { relayImpl });
    socket.emit('message', JSON.stringify({ api_key: 'sk-bad', model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }));
    await promise;
    expect(JSON.parse(socket.send.mock.calls[0][0]).error.code).toBe(401);
    expect(socket.close).toHaveBeenCalledWith(4001, 'auth_failed');
    expect(relayImpl).not.toHaveBeenCalled();
  });

  it('首条消息无 api_key 且无任何 key → error 帧 + 关闭 + 不转发', async () => {
    const socket = makeSocket();
    const relayImpl = vi.fn().mockResolvedValue(undefined);
    const promise = handleWsConnection(socket, {}, { relayImpl });
    socket.emit('message', VALID_FIRST_MESSAGE); // 无 api_key 字段
    await promise;
    expect(JSON.parse(socket.send.mock.calls[0][0]).error.code).toBe(401);
    expect(socket.close).toHaveBeenCalledWith(4001, 'auth_failed');
    expect(relayImpl).not.toHaveBeenCalled();
  });

  it('首条消息携带有效 api_key → 注入 ctx 并转发', async () => {
    mocks.apikey.verifyApiKey.mockResolvedValue({ apiKeyId: 5, userId: 9, keyHash: 'h', scopes: [] });
    const socket = makeSocket();
    const relayImpl = vi.fn().mockResolvedValue(undefined);
    const promise = handleWsConnection(socket, {}, { relayImpl });
    socket.emit('message', JSON.stringify({ api_key: 'sk-good', model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }));
    await promise;
    expect(relayImpl).toHaveBeenCalledWith(expect.objectContaining({
      ctx: { userId: 9, apiKeyId: 5, keyHash: 'h' },
      rawFirstMessage: expect.stringContaining('sk-good'),
    }));
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('query key 有效（握手期注入 apiKeyContext）→ 直接转发', async () => {
    const socket = makeSocket();
    const relayImpl = vi.fn().mockResolvedValue(undefined);
    const promise = handleWsConnection(
      socket,
      { apiKeyContext: { apiKeyId: 3, userId: 7, keyHash: 'h2', scopes: [] } },
      { relayImpl },
    );
    socket.emit('message', VALID_FIRST_MESSAGE);
    await promise;
    expect(relayImpl).toHaveBeenCalledWith(expect.objectContaining({ ctx: { userId: 7, apiKeyId: 3, keyHash: 'h2' } }));
  });

  it('首条消息超时未到 → 关闭连接（4002）', async () => {
    const socket = makeSocket();
    const relayImpl = vi.fn().mockResolvedValue(undefined);
    await handleWsConnection(socket, { apiKeyContext: { apiKeyId: 3, userId: 7, keyHash: 'h2', scopes: [] } }, { relayImpl, firstMessageTimeoutMs: 5 });
    expect(socket.close).toHaveBeenCalledWith(4002, 'no_first_message');
    expect(relayImpl).not.toHaveBeenCalled();
  });
});

// ============================================================
// 3. 余额预检
// ============================================================

describe('relayWebSocket — 余额预检', () => {
  it('余额 0 → 402 错误消息（WS 内）+ 关闭 + 不选路', async () => {
    const socket = makeSocket();
    const deps = makeDeps({ getBalance: vi.fn().mockResolvedValue({ availableBalance: '0' }) });
    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);
    const frame = JSON.parse(socket.send.mock.calls[0][0]);
    expect(frame.error.code).toBe(402);
    expect(frame.error.type).toBe('insufficient_balance');
    expect(socket.close).toHaveBeenCalledWith(4000, 'insufficient_balance');
    expect(deps.selectChannel).not.toHaveBeenCalled();
    expect(deps.settleBilling).not.toHaveBeenCalled(); // 被拒请求不结算（无消费）
    expect(result.error?.code).toBe(402);
  });
});

// ============================================================
// 4. 正常转发（方案 B：SSE → WS 帧包装）
// ============================================================

describe('relayWebSocket — 方案 B 正常转发', () => {
  it('上游 mock 返回 SSE → 客户端 socket 收到包装后的消息帧 + 结算（trustUpstream=true）', async () => {
    const socket = makeSocket();
    const deps = makeDeps({ fetchImpl: vi.fn().mockResolvedValue(sseResponse(SSE_NORMAL)) });
    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);

    // 请求体：model 已映射为平台模型名
    expect(deps.fetchImpl).toHaveBeenCalledWith(
      'https://upstream.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-upstream' }),
      }),
    );
    const sentBody = JSON.parse((deps.fetchImpl.mock.calls[0]![1] as any).body);
    expect(sentBody.model).toBe('upstream-model');
    expect(sentBody.stream).toBe(true);

    // 包装后的 SSE 帧逐帧推给客户端
    expect(socket.send.mock.calls[0][0]).toBe('data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n');
    expect(socket.send.mock.calls[1][0]).toBe('data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n');
    expect(socket.send.mock.calls[2][0]).toBe('data: [DONE]\n\n');

    // 结算：有 usage → 采信上游 trustUpstream=true
    expect(deps.settleBilling).toHaveBeenCalledTimes(1);
    expect(deps.settleBilling).toHaveBeenCalledWith(expect.objectContaining({
      trustUpstream: true,
      fallback: false,
      streamed: true,
      finishReason: 'stop',
      channel: expect.objectContaining({ supplier: expect.objectContaining({ id: 1 }) }),
    }));

    // 上游成功 → 熔断记录 true；客户端关闭
    expect(deps.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:7', true);
    expect(socket.close).toHaveBeenCalledWith(1000, 'done');
    expect(result.mode).toBe('http');
    expect(result.settled).toBe(true);
  });
});

// ============================================================
// 5. 上游断开（无 [DONE]）
// ============================================================

describe('relayWebSocket — 上游断开', () => {
  it('上游 SSE 中途断开（无 [DONE]）→ 客户端收到结束消息 + 结算被调用（fallback）', async () => {
    const socket = makeSocket();
    const deps = makeDeps({
      fetchImpl: vi.fn().mockResolvedValue(sseResponse([
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n', // 无 finish_reason / usage
      ])),
    });
    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);

    // 客户端收到结束消息（补发的 [DONE] 帧）
    const frames = socket.send.mock.calls.map((c: any[]) => c[0]);
    expect(frames).toContain('data: [DONE]\n\n');

    // 结算被调用：异常结束 + 无 usage → 本地 fallback（trustUpstream=false）
    expect(deps.settleBilling).toHaveBeenCalledTimes(1);
    expect(deps.settleBilling).toHaveBeenCalledWith(expect.objectContaining({
      trustUpstream: false,
      fallback: true,
      streamed: true,
    }));
    expect(result.settled).toBe(true);
  });

  it('relayStreamToSocket 读取抛错（上游连接断开）→ abnormal=true', async () => {
    const state = { lastValidUsage: null, generatedText: '', finishReason: null, totalChunks: 0 };
    const badResponse = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"a":1}\n'));
        controller.error(new Error('connection reset'));
      },
    }), { status: 200 });
    const sent: string[] = [];
    const result = await relayStreamToSocket(state as any, badResponse, (c) => sent.push(c), () => false);
    expect(result.sawDone).toBe(false);
    expect(result.abnormal).toBe(true);
  });
});

// ============================================================
// 6. 方案 A：上游 WS 双向透传
// ============================================================

describe('relayWebSocket — 方案 A（上游 WS）', () => {
  it('上游 WS 断开 → 客户端收到结束消息 + 结算被调用', async () => {
    const socket = makeSocket();
    const upstream = makeUpstreamSocket();
    const deps = makeDeps({
      mode: 'ws',
      connectUpstreamWs: vi.fn(() => upstream),
    });

    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);

    // 首条消息 → 上游（readyState OPEN 直接发送）
    expect(upstream.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(upstream.send.mock.calls[0][0]).model).toBe('gpt-4o');

    // 上游 → 客户端：原样透传
    upstream.emit('message', '{"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}');
    await flush();
    expect(socket.send).toHaveBeenCalledWith('{"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}');

    // 客户端后续消息 → 双向透传上游
    socket.emit('message', '{"type":"ping-client"}');
    expect(upstream.send).toHaveBeenLastCalledWith('{"type":"ping-client"}');

    // 上游断开 → 结束消息 + 结算（有 usage → 采信）
    upstream.emit('close');
    await flush();
    await flush();
    expect(socket.send).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(deps.settleBilling).toHaveBeenCalledTimes(1);
    expect(deps.settleBilling).toHaveBeenCalledWith(expect.objectContaining({ trustUpstream: true, streamed: true }));
    expect(socket.close).toHaveBeenCalledWith(1000, 'done');
    expect(result.mode).toBe('ws');
  });

  it('上游 WS 连接失败（工厂抛错）→ 502 错误帧 + 关闭', async () => {
    const socket = makeSocket();
    const deps = makeDeps({
      mode: 'ws',
      connectUpstreamWs: vi.fn(() => { throw new Error('refused'); }),
    });
    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);
    expect(JSON.parse(socket.send.mock.calls[0][0]).error.code).toBe(502);
    expect(socket.close).toHaveBeenCalledWith(4000, 'upstream_unavailable');
    expect(result.error?.code).toBe(502);
  });
});

// ============================================================
// 7. 心跳
// ============================================================

describe('relayWebSocket — 心跳', () => {
  it('心跳定时器被设置（setInterval 30000）；回调触发 ping；结束 clearInterval', async () => {
    const socket = makeSocket();
    const deps = makeDeps({ fetchImpl: vi.fn().mockResolvedValue(sseResponse(SSE_NORMAL)) });
    await runRelay(socket, VALID_FIRST_MESSAGE, deps);

    // 30s 心跳被设置
    expect(deps.timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 30_000);

    // 触发回调 → 非空闲 → socket.ping()
    const heartbeatCb = (deps.timers.setInterval.mock.calls[0] as unknown[])[0] as () => void;
    heartbeatCb();
    expect(socket.ping).toHaveBeenCalled();

    // 空闲 60s+（now 前移 61s）→ 关闭连接（4001 idle timeout）
    deps.now.mockReturnValue(1_000_000 + 61_000);
    heartbeatCb();
    expect(socket.close).toHaveBeenCalledWith(4001, 'idle timeout');

    // 转发结束 → 清理心跳
    expect(deps.timers.clearInterval).toHaveBeenCalledWith(42);
  });

  it('socket 无 ping 方法 → 心跳退化发送 JSON ping 帧', async () => {
    const socket = makeSocket();
    delete socket.ping;
    const deps = makeDeps({ fetchImpl: vi.fn().mockResolvedValue(sseResponse(SSE_NORMAL)) });
    await runRelay(socket, VALID_FIRST_MESSAGE, deps);
    const heartbeatCb = (deps.timers.setInterval.mock.calls[0] as unknown[])[0] as () => void;
    heartbeatCb();
    expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toEqual({ type: 'ping', ts: 1_000_000 });
  });
});

// ============================================================
// 8. selectChannel null → mock 回退
// ============================================================

describe('relayWebSocket — selectChannel 返回 null → mock 回退', () => {
  it('无可用渠道 → mock 占位响应 + 结算（fallback=true, channel=null）', async () => {
    const socket = makeSocket();
    const deps = makeDeps({ selectChannel: vi.fn().mockResolvedValue(null) });
    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);

    // 客户端收到占位 completion 帧
    const frames = socket.send.mock.calls.map((c: any[]) => c[0]);
    const completionFrame = frames.find((f: string) => f.includes('[3cloud 模拟响应]'));
    expect(completionFrame).toBeDefined();
    expect(JSON.parse(completionFrame).mock).toBe(true);
    expect(frames).toContain('data: [DONE]\n\n');

    // mock 回退同样记账（fallback=true, streamed=false, channel=null）
    expect(deps.settleBilling).toHaveBeenCalledTimes(1);
    expect(deps.settleBilling).toHaveBeenCalledWith(expect.objectContaining({
      fallback: true,
      trustUpstream: false,
      streamed: false,
      channel: null,
      finishReason: 'stop',
    }));
    expect(socket.close).toHaveBeenCalledWith(1000, 'done');
    expect(result.mode).toBe('mock');
  });
});

// ============================================================
// 9. 客户端断开未结算 → 按已收 chunk 结算
// ============================================================

describe('relayWebSocket — 客户端断开未结算', () => {
  it('客户端在转发中断开 → 按已收 chunk 结算（仅此一次）', async () => {
    const socket = makeSocket();
    const deps = makeDeps();
    let resolveFetch!: (r: Response) => void;
    deps.fetchImpl = vi.fn(() => new Promise<Response>((r) => { resolveFetch = r; }));

    const relayPromise = runRelay(socket, VALID_FIRST_MESSAGE, deps);

    // 等 relay 到达上游请求阶段
    await vi.waitFor(() => expect(deps.fetchImpl).toHaveBeenCalled());

    // 客户端断开 → 未结算 → 按已收 chunk（0 chunk → 只收输入 token，fallback）结算
    socket.emit('close');
    await flush();
    expect(deps.settleBilling).toHaveBeenCalledTimes(1);
    expect(deps.settleBilling).toHaveBeenCalledWith(expect.objectContaining({
      trustUpstream: false,
      fallback: true,
      errorCode: 'client_closed',
    }));

    // 上游随后返回完整 SSE → 不重复结算
    resolveFetch!(sseResponse(SSE_NORMAL));
    await relayPromise;
    expect(deps.settleBilling).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 10. 上游 HTTP 非 2xx
// ============================================================

describe('relayWebSocket — 上游 HTTP 错误', () => {
  it('上游返回 5xx → 错误帧 + 关闭 + 熔断记录失败', async () => {
    const socket = makeSocket();
    const deps = makeDeps({ fetchImpl: vi.fn().mockResolvedValue(new Response('boom', { status: 502 })) });
    const result = await runRelay(socket, VALID_FIRST_MESSAGE, deps);
    expect(JSON.parse(socket.send.mock.calls[0][0]).error.code).toBe(502);
    expect(socket.close).toHaveBeenCalledWith(4000, 'upstream_error');
    expect(deps.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:7', false);
    expect(deps.settleBilling).not.toHaveBeenCalled(); // 上游失败不结算（无消费）
    expect(result.settled).toBe(false);
  });
});

// ============================================================
// 11. wsErrorFrame
// ============================================================

describe('wsErrorFrame — 工具', () => {
  it('生成 OpenAI 兼容 error JSON', () => {
    expect(JSON.parse(wsErrorFrame(402, '余额不足，请充值', 'insufficient_balance'))).toEqual({
      error: { message: '余额不足，请充值', type: 'insufficient_balance', code: 402 },
    });
  });
});
