/**
 * OpenAI 兼容端点单元测试 — /v1/embeddings、/v1/completions、/v1/models
 *
 * 纯单测风格（对齐 key-selector.test.ts / sse-stream.test.ts / circuit-breaker.test.ts）：
 * 对 db / fetch / selectChannel / apiKeyAuth 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - embeddings：缺 model / 缺 input → 400；正常转发（URL 以 /v1/embeddings 结尾 + 响应透传 + 记账）；
 *   余额 0 → 402；无可用 channel → mock 回退且记账；数组 input → 多条占位 embedding
 * - completions：缺 model / 缺 prompt → 400；非流式转发到 /v1/completions；流式 SSE 转发 + 流式结算；
 *   无可用 channel → mock 回退且记账
 * - models：DB 返回去重模型列表；DB 查询失败 → 空数组兜底
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { openaiCompatRoutes } from '../src/routes/openai-compat';

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
  // 只提供路由代码会访问的列占位对象（eq/and 只构造 SQL 对象，不真正执行）
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
// 四级限流（P0-2）为跨切面网关守卫，路由单测中整体 mock，避免真实 Redis/DB 计数干扰
vi.mock('../src/services/rate-limit', () => ({
  enforceRateLimitPreHandler: vi.fn(async () => {}),
  enforceRateLimit: vi.fn(),
  estimateRequestTokens: vi.fn(() => 1),
  isExceptionActive: vi.fn(() => false),
  buildRateLimitContext: vi.fn(),
  computeEffectiveLimit: vi.fn(),
  computeEffectiveLimits: vi.fn(),
}));
// 幂等守卫（P0-3）：路由单测整体 mock，避免真实 Redis SETNX/DB 兜底干扰
vi.mock('../src/services/idempotency', () => ({
  resolveIdempotencyKey: vi.fn((_req: unknown, fallback: string) => fallback),
  acquireIdempotencyLock: vi.fn().mockResolvedValue({ status: 'degraded' }),
  releaseIdempotencyLock: vi.fn().mockResolvedValue(undefined),
  replayIdempotentRequest: vi.fn().mockResolvedValue(false),
  cacheIdempotentResponse: vi.fn().mockResolvedValue(undefined),
  isIdempotencyUniqueViolation: vi.fn(() => false),
  buildIdempotencySummary: vi.fn((p: Record<string, unknown>) => ({ idempotent_replay: true, ...p })),
}));
// 预扣（P0-1）：路由单测整体 mock（bypass 直通 + 无冻结），避免真实 Redis Lua/PG 镜像干扰
vi.mock('../src/services/billing/pre-consume', () => ({
  preConsume: vi.fn().mockResolvedValue({ mode: 'bypass', amount: 0, requestId: 'test' }),
  releasePreConsume: vi.fn().mockResolvedValue(undefined),
  settlePreConsume: vi.fn().mockResolvedValue(undefined),
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
 * 让 db.select 返回完整查询链（select → from → innerJoin → where → orderBy），
 * 并使 orderBy 解析到给定行；传函数时按函数返回值处理（支持 reject 模拟 DB 失败）。
 */
function mockDbSelectChain(result: unknown[] | (() => Promise<unknown[]>)) {
  const orderBy = vi.fn();
  if (typeof result === 'function') {
    orderBy.mockImplementation(result);
  } else {
    orderBy.mockResolvedValue(result);
  }
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ orderBy }),
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

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  // apiKeyAuth 直接放行并注入上下文（绕过真实 DB 校验）
  mocks.apikey.apiKeyAuth.mockImplementation(async (request: any) => {
    request.apiKeyContext = { userId: 1, apiKeyId: 11, keyHash: 'test-hash' };
  });

  // 默认余额充足
  mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
  mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
  mocks.consumption.recordConsumption.mockResolvedValue({ id: 1 });
  mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
  mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
  mockDbUpdate();

  // fetch 全局 stub
  vi.stubGlobal('fetch', mocks.fetch);

  app = Fastify();
  await app.register(openaiCompatRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// ============================================================
// POST /v1/embeddings
// ============================================================

describe('POST /v1/embeddings', () => {
  it('请求体校验：缺 model → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/embeddings', payload: { input: 'hello' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });

  it('请求体校验：缺 input → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/embeddings', payload: { model: 'test-model' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
  });

  it('正常路径：selectChannel 返回 channel → fetch 调用、URL 以 /v1/embeddings 结尾、响应透传', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = {
      object: 'list',
      data: [{ object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 }],
      model: 'upstream-model',
      usage: { prompt_tokens: 4, total_tokens: 4 },
    };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({ method: 'POST', url: '/v1/embeddings', payload: { model: 'test-model', input: 'hello' } });

    expect(res.statusCode).toBe(200);
    // fetch 被调用且 URL 以 /v1/embeddings 结尾
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toMatch(/\/v1\/embeddings$/);
    // 上游请求体 model 映射为供应商平台模型名
    expect(JSON.parse((init as RequestInit).body as string).model).toBe('upstream-model');
    // 响应透传
    expect(res.json().data[0].embedding).toEqual([0.1, 0.2, 0.3]);
    // 记账：streamed=false、trustUpstream=true（采信上游 usage）
    expect(mocks.balance.deductBalance).toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      streamed: false,
      trustUpstream: true,
      fallback: false,
      inputTokens: 4,
      outputTokens: 0,
    }));
  });

  it('余额为 0 → 402，且不发起上游调用', async () => {
    mocks.balance.getBalance.mockResolvedValue({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', currency: 'CNY' });
    const res = await app.inject({ method: 'POST', url: '/v1/embeddings', payload: { model: 'test-model', input: 'hello' } });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.type).toBe('insufficient_balance');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('无可用 channel → mock 回退（返回占位 embedding 且记账）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/v1/embeddings', payload: { model: 'test-model', input: 'hello world' } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].embedding.length).toBeGreaterThan(0);
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    // 未请求上游
    expect(mocks.fetch).not.toHaveBeenCalled();
    // mock 回退记账标记
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      streamed: false,
      trustUpstream: false,
      fallback: true,
    }));
  });

  it('数组 input → mock 回退返回多条占位 embedding', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/embeddings',
      payload: { model: 'test-model', input: ['first sentence', 'second sentence'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].index).toBe(0);
    expect(body.data[1].index).toBe(1);
    // 两条向量不同（种子含 index）
    expect(body.data[0].embedding).not.toEqual(body.data[1].embedding);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ fallback: true }));
  });
});

// ============================================================
// POST /v1/completions
// ============================================================

describe('POST /v1/completions', () => {
  it('请求体校验：缺 model → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/completions', payload: { prompt: 'hi' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
  });

  it('请求体校验：缺 prompt → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/completions', payload: { model: 'test-model' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
  });

  it('非流式正常路径 → fetch 转发到 /v1/completions', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = {
      id: 'cmpl-1',
      object: 'text_completion',
      choices: [{ index: 0, text: 'Hi there', finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200 }));

    const res = await app.inject({ method: 'POST', url: '/v1/completions', payload: { model: 'test-model', prompt: 'Say hi' } });

    expect(res.statusCode).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toMatch(/\/v1\/completions$/);
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.model).toBe('upstream-model');
    expect(sentBody.stream).toBe(false);
    // 响应透传
    expect(res.json().choices[0].text).toBe('Hi there');
    // 记账：采信上游 usage
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      streamed: false,
      trustUpstream: true,
      fallback: false,
      inputTokens: 5,
      outputTokens: 2,
    }));
  });

  it('流式路径 → SSE 转发（假上游 Response 流）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const sse = [
      'data: {"choices":[{"text":"Hello","index":0,"finish_reason":null}]}\n\n',
      'data: {"choices":[{"text":" world","index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
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
      url: '/v1/completions',
      payload: { model: 'test-model', prompt: 'Say hi', stream: true },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/event-stream');
    expect(res.body).toContain('data: [DONE]');
    expect(res.body).toContain('"text":"Hello"');

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

  it('无可用 channel → mock 回退（返回占位 completion 且记账）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/v1/completions', payload: { model: 'test-model', prompt: 'Say hi' } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.object).toBe('text_completion');
    expect(body.choices[0].text).toContain('[3cloud 模拟响应]');
    expect(body.usage.completion_tokens).toBeGreaterThan(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      streamed: false,
      trustUpstream: false,
      fallback: true,
      finishReason: 'stop',
    }));
  });
});

// ============================================================
// GET /v1/models
// ============================================================

describe('GET /v1/models', () => {
  it('从 DB 返回去重模型列表', async () => {
    mockDbSelectChain([
      { platformModel: 'deepseek-v3', supplierName: 'Supplier A' },
      { platformModel: 'gpt-4o', supplierName: 'Supplier A' },
      { platformModel: 'gpt-4o', supplierName: 'Supplier B' },
    ]);

    const res = await app.inject({ method: 'GET', url: '/v1/models' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(2); // gpt-4o 去重后只剩 1 个
    const ids = body.data.map((m: { id: string }) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['gpt-4o', 'deepseek-v3']));
    const gpt = body.data.find((m: { id: string }) => m.id === 'gpt-4o');
    expect(gpt.object).toBe('model');
    expect(gpt.owned_by).toBe('Supplier A'); // 同一 platformModel 保留第一个供应商
  });

  it('DB 查询失败 → 空数组兜底（不 500）', async () => {
    mockDbSelectChain(() => Promise.reject(new Error('db down')));

    const res = await app.inject({ method: 'GET', url: '/v1/models' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ object: 'list', data: [] });
  });
});
