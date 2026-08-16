/**
 * Midjourney / Suno 任务型渠道适配端点单元测试 — /v1/mj/* 与 /v1/suno/*
 *
 * 纯单测风格（对齐 responses.test.ts / rerank.test.ts）：
 * 对 db / fetch / selectTaskChannel / apiKeyAuth 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - POST /v1/mj/submit/imagine：selectTaskChannel 返回 channel → fetch 转发到
 *   {baseUrl}/mj/submit/imagine（含 mj-api-secret 头）→ 记账模型 mj_imagine、任务单价
 * - POST /v1/mj/submit/imagine 余额 0 → 402，不发起上游调用
 * - POST /v1/mj/submit/imagine 无可用 channel → mock 回退（占位任务 id + 记账 fallback）
 * - POST /v1/suno/submit/MUSIC：fetch 转发到 {baseUrl}/suno/submit/MUSIC、记账模型 suno_music
 * - GET /v1/mj/task/:id/fetch：转发轮询、不记账（recordConsumption 不被调用）
 * - POST /v1/suno/fetch：批量轮询转发、不记账
 * - 缺 action → 400；fetch 无可用 channel → 502
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { taskRelayRoutes } from '../src/routes/task-relay';

// ============================================================
// Module mocks（vi.hoisted 保证 factory 可引用）
// ============================================================

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn() },
  routing: { selectTaskChannel: vi.fn() },
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
    apiKeys: { id: {}, lastUsedAt: {} },
  },
}));
vi.mock('../src/services/upstream/routing', () => ({ selectTaskChannel: mocks.routing.selectTaskChannel }));
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

/** 构造 selectTaskChannel 返回的 channel（供应商 baseUrl 固定 https://upstream.test） */
function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    supplier: { id: 1, name: 'Task Supplier', code: 'task', baseUrl: 'https://upstream.test', status: 'active', healthStatus: null, allowedGroups: [] },
    key: { id: 7, supplierId: 1, keyValue: 'sk-upstream', name: 'k1', status: 'active', selectMode: 'single', priority: 1, currentBalance: null },
    modelMapping: { id: 3, supplierId: 1, modelName: 'mj_imagine', platformModel: 'mj_imagine', status: 'active' },
    ...overrides,
  };
}

/** 让 db.select 返回定价查询链（select → from → innerJoin → where → limit），默认走默认价 */
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
  await app.register(taskRelayRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// ============================================================
// POST /v1/mj/submit/:action
// ============================================================

describe('POST /v1/mj/submit/:action', () => {
  it('正常路径：fetch 转发到 {baseUrl}/mj/submit/imagine（含 mj-api-secret 头），记账模型 mj_imagine + 任务单价', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = { code: 1, result: 'task-abc-123', description: 'submitted', properties: { finalPrompt: 'a cat' } };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/imagine',
      payload: { prompt: 'a cat --ar 16:9' },
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/mj/submit/imagine');
    // MJ 渠道：同时带 Authorization Bearer + mj-api-secret 头
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-upstream');
    expect(headers['mj-api-secret']).toBe('sk-upstream');
    // 请求体透传
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: 'a cat --ar 16:9' });
    // 上游响应体透传
    expect(res.json().result).toBe('task-abc-123');

    // 记账：模型 mj_imagine、1 任务 = 1000 output tokens、streamed=false、trustUpstream=true
    expect(mocks.balance.deductBalance).toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mj_imagine',
      inputTokens: 0,
      outputTokens: 1000,
      streamed: false,
      trustUpstream: true,
      fallback: false,
      finishReason: 'stop',
    }));
  });

  it('余额 0 → 402，不发起上游调用', async () => {
    mocks.balance.getBalance.mockResolvedValue({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', currency: 'CNY' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/imagine',
      payload: { prompt: 'a cat' },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.type).toBe('insufficient_balance');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('无可用 channel → mock 回退（占位任务 id + 记账 fallback=true）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/imagine',
      payload: { prompt: 'a cat' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.code).toBe(1);
    expect(body.result).toMatch(/^mock-task-/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mj_imagine',
      outputTokens: 1000,
      trustUpstream: false,
      fallback: true,
    }));
  });

  it('缺 action 路径参数（空串）→ 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/',
      payload: { prompt: 'a cat' },
    });
    // Fastify 将空 action 匹配到 :action 路由 → validateAction 抛 400
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('"action" is required in the path');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('自定义 action 未在映射表 → 回退计费模型 mj_imagine', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 1, result: 't1' }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/weird-action',
      payload: { prompt: 'x' },
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ model: 'mj_imagine' }));
  });
});

// ============================================================
// POST /v1/suno/submit/:action
// ============================================================

describe('POST /v1/suno/submit/:action', () => {
  it('MUSIC 动作：fetch 转发到 {baseUrl}/suno/submit/MUSIC，记账模型 suno_music，无 mj-api-secret 头', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel({ modelMapping: { id: 4, supplierId: 1, modelName: 'suno_music', platformModel: 'suno_music', status: 'active' } }));
    const upstreamPayload = { code: 'success', message: '', data: 'task-suno-1' };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/suno/submit/MUSIC',
      payload: { prompt: 'a song about the sea', mv: 'chirp-v3-0' },
    });

    expect(res.statusCode).toBe(200);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/suno/submit/MUSIC');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['mj-api-secret']).toBeUndefined(); // Suno 不需要 mj-api-secret
    expect(res.json().data).toBe('task-suno-1');
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'suno_music',
      inputTokens: 0,
      outputTokens: 1000,
      fallback: false,
    }));
  });

  it('LYRICS 动作（小写归一）→ 记账模型 suno_lyrics', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'success', data: 't2' }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/suno/submit/lyrics',
      payload: { prompt: 'write lyrics' },
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ model: 'suno_lyrics' }));
  });

  it('无可用 channel → mock 回退（Suno 占位 data + 记账 fallback=true）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suno/submit/MUSIC',
      payload: { prompt: 'x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.code).toBe('success');
    expect(body.data).toMatch(/^mock-task-/);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'suno_music',
      fallback: true,
    }));
  });
});

// ============================================================
// 任务轮询（不记账）
// ============================================================

describe('任务轮询（GET /v1/mj/task/:id/fetch 等，不记账）', () => {
  it('GET /v1/mj/task/:id/fetch → 转发到 {baseUrl}/mj/task/:id/fetch，不调用 recordConsumption', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = { id: 'task-abc', status: 'SUCCESS', progress: '100%', imageUrl: 'https://example.com/img.png' };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({ method: 'GET', url: '/v1/mj/task/task-abc/fetch' });

    expect(res.statusCode).toBe(200);
    const [url] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/mj/task/task-abc/fetch');
    expect(res.json().status).toBe('SUCCESS');
    // 轮询不记账
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
    expect(mocks.balance.deductBalance).not.toHaveBeenCalled();
  });

  it('GET /v1/suno/fetch/:id → 转发到 {baseUrl}/suno/fetch/:id，不记账', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'success', data: { task_id: 't1' } }), { status: 200 }));

    const res = await app.inject({ method: 'GET', url: '/v1/suno/fetch/t1' });

    expect(res.statusCode).toBe(200);
    const [url] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/suno/fetch/t1');
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
  });

  it('POST /v1/suno/fetch → 批量轮询转发，不记账', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'success', data: [] }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/suno/fetch',
      payload: { ids: ['t1', 't2'] },
    });

    expect(res.statusCode).toBe(200);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/suno/fetch');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ['t1', 't2'] });
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
  });

  it('fetch 无可用 channel → 502 channel_unavailable（不 mock、不记账）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/v1/mj/task/t1/fetch' });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.type).toBe('channel_unavailable');
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
  });
});
