/**
 * Rerank 兼容端点单元测试 — POST /v1/rerank
 *
 * 纯单测风格（对齐 openai-compat.test.ts）：
 * 对 db / fetch / selectChannel / apiKeyAuth 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - 校验：缺 model / 缺 query / 缺 documents → 400
 * - 正常路径：selectChannel mock → fetch 调用、URL 以 /v1/rerank 结尾、响应透传、记账
 * - 余额 0 → 402（且不发起上游调用）
 * - 无可用 channel → mock 回退（占位结果 + 记账 fallback=true）
 * - documents 数组含对象 {text} → 上游透传兼容
 * - top_n / return_documents → 透传到上游请求体
 * - Cohere 风格 usage（仅 total_tokens）→ 按 total_tokens 计费（rerank 计费归一化）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { rerankRoutes } from '../src/routes/rerank';

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
 * 让 db.select 返回 getPricingForModel 所需的完整查询链
 * （select → from → innerJoin → where → limit），limit 解析为空数组 → 走默认价。
 */
function mockDbSelectForPricing() {
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  });
}

/** 让 db.update 返回完整更新链（update → set → where），用于更新 key lastUsedAt */
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
  mockDbSelectForPricing();
  mockDbUpdate();

  // fetch 全局 stub
  vi.stubGlobal('fetch', mocks.fetch);

  app = Fastify();
  await app.register(rerankRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// ============================================================
// POST /v1/rerank
// ============================================================

describe('POST /v1/rerank', () => {
  it('请求体校验：缺 model → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { query: 'what is 3cloud', documents: ['doc a'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });

  it('请求体校验：缺 query → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { model: 'test-model', documents: ['doc a'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
  });

  it('请求体校验：缺 documents → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { model: 'test-model', query: 'what is 3cloud' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request');
  });

  it('正常路径：selectChannel 返回 channel → fetch 调用、URL 以 /v1/rerank 结尾、响应透传', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = {
      id: 'rerank-upstream-1',
      results: [
        { index: 1, relevance_score: 0.93, document: { text: 'doc b' } },
        { index: 0, relevance_score: 0.51, document: { text: 'doc a' } },
      ],
      usage: { prompt_tokens: 12, total_tokens: 12 },
    };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { model: 'test-model', query: 'what is 3cloud', documents: ['doc a', 'doc b'] },
    });

    expect(res.statusCode).toBe(200);
    // fetch 被调用且 URL 以 /v1/rerank 结尾
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toMatch(/\/v1\/rerank$/);
    // 上游请求体 model 映射为供应商平台模型名
    expect(JSON.parse((init as RequestInit).body as string).model).toBe('upstream-model');
    // 响应透传
    const body = res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].relevance_score).toBe(0.93);
    // 记账：streamed=false、trustUpstream=true（采信上游 usage）
    expect(mocks.balance.deductBalance).toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      streamed: false,
      trustUpstream: true,
      fallback: false,
      inputTokens: 12,
      outputTokens: 0,
    }));
  });

  it('余额为 0 → 402，且不发起上游调用', async () => {
    mocks.balance.getBalance.mockResolvedValue({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', currency: 'CNY' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { model: 'test-model', query: 'what is 3cloud', documents: ['doc a'] },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.type).toBe('insufficient_balance');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });

  it('无可用 channel → mock 回退（占位结果 + 记账）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: {
        model: 'test-model',
        query: 'what is 3cloud',
        documents: ['first doc', 'second doc'],
        return_documents: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.results).toHaveLength(2);
    // 按原文顺序返回占位结果：index 递增 + relevance_score 固定 0.5
    expect(body.results[0].index).toBe(0);
    expect(body.results[0].relevance_score).toBe(0.5);
    expect(body.results[1].index).toBe(1);
    expect(body.results[1].relevance_score).toBe(0.5);
    // return_documents=true → 内嵌原文
    expect(body.results[0].document.text).toBe('first doc');
    expect(body.results[1].document.text).toBe('second doc');
    expect(body.usage.total_tokens).toBeGreaterThan(0);
    // 未请求上游
    expect(mocks.fetch).not.toHaveBeenCalled();
    // mock 回退记账标记
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      streamed: false,
      trustUpstream: false,
      fallback: true,
    }));
  });

  it('documents 数组含对象 {text} → 透传兼容（上游请求体原样携带）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = {
      id: 'rerank-upstream-2',
      results: [{ index: 0, relevance_score: 0.8, document: { text: 'object doc' } }],
      usage: { total_tokens: 9 },
    };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200 }));

    const documents = ['plain doc', { text: 'object doc' }];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { model: 'test-model', query: 'what is 3cloud', documents },
    });

    expect(res.statusCode).toBe(200);
    const [, init] = mocks.fetch.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    // documents 原样透传（string 与 {text} 混合）
    expect(sentBody.documents).toEqual(documents);
    // 响应透传
    expect(res.json().results[0].relevance_score).toBe(0.8);
  });

  it('top_n / return_documents → 透传到上游请求体', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = {
      id: 'rerank-upstream-3',
      results: [{ index: 0, relevance_score: 0.7, document: { text: 'doc a' } }],
      usage: { total_tokens: 8 },
    };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: {
        model: 'test-model',
        query: 'what is 3cloud',
        documents: ['doc a', 'doc b', 'doc c'],
        top_n: 2,
        return_documents: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const [, init] = mocks.fetch.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.top_n).toBe(2);
    expect(sentBody.return_documents).toBe(true);
    // 未显式传的参数不应出现在上游请求体
    expect(sentBody.query).toBe('what is 3cloud');
  });

  it('上游 usage 仅含 total_tokens（Cohere 风格）→ 按 total_tokens 计费', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    // Cohere/Jina rerank 常见：usage 只有 total_tokens，无 prompt_tokens
    const upstreamPayload = {
      id: 'rerank-upstream-4',
      results: [{ index: 0, relevance_score: 0.9, document: { text: 'doc a' } }],
      usage: { total_tokens: 15 },
    };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/rerank',
      payload: { model: 'test-model', query: 'what is 3cloud', documents: ['doc a'] },
    });

    expect(res.statusCode).toBe(200);
    // 按 total_tokens=15 计输入（prompt_tokens 缺失时不落为 0）
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      trustUpstream: true,
      fallback: false,
      inputTokens: 15,
      outputTokens: 0,
    }));
  });
});
