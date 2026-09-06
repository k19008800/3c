/**
 * 幂等守卫网关集成测试 — chat 路由 × 真实 idempotency 服务 × mock Redis/DB/上游
 *
 * 纯单测风格（对齐 messages.test.ts / openai-compat.test.ts）：
 * 对 db / fetch / selectChannel / apiKeyAuth / lib/redis 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络；idempotency 服务本身用真实实现，验证路由接线完整。
 *
 * 覆盖（iteration-plan-v2.md P0-3 测试要求）：
 * - 同 Idempotency-Key 二次提交（非流式）→ 回放首次响应 + X-Idempotent-Replay，不重复扣费
 * - 同 Idempotency-Key 二次提交（流式）→ 摘要回放 + 标记，不重复计费
 * - 不同幂等键 → 各自正常处理
 * - 幂等命中不触发佣金二次生成
 * - DB 唯一约束兜底：Redis 失效时重复 insert → 409 幂等提示而非 500
 * - Redis 不可用 → 降级放行
 * - Redis 缓存丢失 → L2 查 consumption_records 补偿回放摘要
 *
 * @see docs/iteration-plan-v2.md P0-3
 * @see coding-standards-api-db-test.md §3 测试规范
 * @module test/idempotency-gateway
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { chatRoutes } from '../src/routes/chat';

// ============================================================
// Module mocks（vi.hoisted 保证 factory 可引用）
// ============================================================

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn() },
  schema: {
    vendorPricing: { inputPrice: {}, outputPrice: {}, supplierModelId: {} },
    supplierModels: { id: {}, modelName: {}, platformModel: {}, supplierId: {}, status: {} },
    suppliers: { id: {}, name: {}, status: {} },
    apiKeys: { id: {}, lastUsedAt: {} },
    consumptionRecords: {
      requestId: {}, model: {}, inputTokens: {}, outputTokens: {},
      totalTokens: {}, cost: {}, finishReason: {}, streamed: {},
    },
    customerBalances: { userId: {}, availableBalance: {}, frozenBalance: {} },
  },
  routing: { selectChannel: vi.fn() },
  circuitBreaker: { recordChannelResult: vi.fn(), isCircuitOpen: vi.fn() },
  balance: {
    getBalance: vi.fn(), deductBalance: vi.fn(), addBalance: vi.fn(), initBalance: vi.fn(),
    freezeBalance: vi.fn(), settleFrozenBalance: vi.fn(), releaseFrozenBalance: vi.fn(),
  },
  consumption: { recordConsumption: vi.fn(), getUserConsumptionStats: vi.fn() },
  commission: { generateCommissionForConsumption: vi.fn() },
  conversation: { recordConversationContext: vi.fn(), fingerprintKey: vi.fn() },
  apikey: { apiKeyAuth: vi.fn() },
  redis: { getRedis: vi.fn(), cacheGet: vi.fn(), cacheSet: vi.fn(), cacheDel: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock('../src/db', () => ({
  db: mocks.db,
  schema: mocks.schema,
}));
vi.mock('../src/services/auth/apikey', () => ({
  apiKeyAuth: mocks.apikey.apiKeyAuth,
  hashApiKey: vi.fn(),
  extractApiKeyFromHeader: vi.fn(),
  verifyApiKey: vi.fn(),
}));
vi.mock('../src/services/upstream/routing', () => ({ selectChannel: mocks.routing.selectChannel }));
vi.mock('../src/services/upstream/circuit-breaker', () => ({
  recordChannelResult: mocks.circuitBreaker.recordChannelResult,
  isCircuitOpen: mocks.circuitBreaker.isCircuitOpen,
}));
vi.mock('../src/services/billing/balance', () => ({
  getBalance: mocks.balance.getBalance,
  deductBalance: mocks.balance.deductBalance,
  addBalance: mocks.balance.addBalance,
  initBalance: mocks.balance.initBalance,
  freezeBalance: mocks.balance.freezeBalance,
  settleFrozenBalance: mocks.balance.settleFrozenBalance,
  releaseFrozenBalance: mocks.balance.releaseFrozenBalance,
}));
vi.mock('../src/services/billing/consumption-log', () => ({
  recordConsumption: mocks.consumption.recordConsumption,
  getUserConsumptionStats: mocks.consumption.getUserConsumptionStats,
}));
vi.mock('../src/services/agent/commission', () => ({
  generateCommissionForConsumption: mocks.commission.generateCommissionForConsumption,
}));
vi.mock('../src/services/audit/conversation-context', () => ({
  recordConversationContext: mocks.conversation.recordConversationContext,
  fingerprintKey: mocks.conversation.fingerprintKey,
}));
vi.mock('../src/lib/redis', () => ({
  getRedis: mocks.redis.getRedis,
  cacheGet: mocks.redis.cacheGet,
  cacheSet: mocks.redis.cacheSet,
  cacheDel: mocks.redis.cacheDel,
}));
// P0-2（并行任务）已在路由 preHandler 接入 enforceRateLimitPreHandler；
// 本测试聚焦幂等，限流属 P0-2 范围，mock 掉避免拉入其 DB 依赖模块图。
// ⚠️ 必须返回 resolved promise（async）：Fastify preHandler 若收到 undefined 会挂起（已踩坑）
vi.mock('../src/services/rate-limit', () => ({
  enforceRateLimitPreHandler: vi.fn(async () => {}),
}));

// ============================================================
// 可变状态（每个用例重建）
// ============================================================

/** Redis 幂等锁存储（idem:{key} → token） */
let lockStore: Map<string, string>;
/** Redis 响应缓存存储（idem:resp:{key} → JSON） */
let respStore: Map<string, string>;
/** 假 Redis 客户端（set 支持 NX 语义，eval 支持值匹配删除） */
// Keep this fake aligned with the Redis surface used by ledger.ts.  The gateway
// currently exercises the idempotency commands only, but omitting exists/type
// here makes any ledger initialization silently take its degraded path.
let redisClient: {
  set: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  hget: ReturnType<typeof vi.fn>;
  hincrby: ReturnType<typeof vi.fn>;
};
/** L2 DB 兜底：consumption_records 按 request_id 查询结果（用例可覆写） */
let consumptionLookup: () => Promise<unknown[]>;

let app: FastifyInstance;

// ============================================================
// Test helpers
// ============================================================

/** 构造 selectChannel 返回的 channel */
function makeChannel() {
  return {
    supplier: { id: 1, name: 'Test Supplier', code: 'test', baseUrl: 'https://upstream.test', status: 'active', healthStatus: null },
    key: { id: 7, supplierId: 1, keyValue: 'sk-upstream', name: 'k1', status: 'active', selectMode: 'single', priority: 1, currentBalance: null },
    modelMapping: { id: 3, supplierId: 1, modelName: 'deepseek-v3', platformModel: 'upstream-model', status: 'active' },
  };
}

/** OpenAI 格式上游非流式响应（chat/completions） */
function makeUpstreamChatResponse() {
  return {
    id: 'chatcmpl-upstream',
    object: 'chat.completion',
    created: 1700000000,
    model: 'upstream-model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from upstream' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  };
}

/** OpenAI 格式上游 SSE 流（含 usage 尾帧） */
function makeUpstreamSSE() {
  return [
    'data: {"choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":" world"},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
    'data: [DONE]\n\n',
  ].join('');
}

/**
 * mock 上游非流式 JSON 响应。
 *
 * 必须每次调用返回新的 Response：Response body 只能被读取一次，
 * 同一实例二次 fetch（不同幂等键的正常处理）会抛 "body already read"。
 */
function mockUpstreamJsonResponse() {
  mocks.fetch.mockImplementation(
    async () => new Response(JSON.stringify(makeUpstreamChatResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
}

/** mock 上游 SSE 流响应（每次调用新 Response） */
function mockUpstreamStreamResponse() {
  mocks.fetch.mockImplementation(
    async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(makeUpstreamSSE()));
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ),
  );
}

beforeEach(async () => {
  // resetAllMocks：同时清掉 once 实现（mockRejectedValueOnce 等），防止跨用例泄漏
  vi.resetAllMocks();

  // ── Redis 状态（默认 Redis 可用）──
  lockStore = new Map();
  respStore = new Map();
  const valueStore = new Map<string, string>();
  const hashStore = new Map<string, Map<string, string>>();
  redisClient = {
    set: vi.fn(async (key: string, token: string) => {
      if (lockStore.has(key)) return null;
      lockStore.set(key, token);
      valueStore.set(key, token);
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, numKeys: number, key: string, token: string, ...args: string[]) => {
      // ledger initialization uses a one-key Lua script; model its HASH result
      // instead of letting the gateway silently fall back to bypass mode.
      if (numKeys === 1 && key.startsWith('bal:')) {
        const hash = hashStore.get(key) ?? new Map<string, string>();
        hash.set('available', token);
        hash.set('frozen', args[0] ?? '0');
        hashStore.set(key, hash);
        return 1;
      }
      if (lockStore.get(key) === token) {
        lockStore.delete(key);
        return 1;
      }
      return 0;
    }),
    exists: vi.fn(async (key: string) => (valueStore.has(key) || hashStore.has(key) ? 1 : 0)),
    type: vi.fn(async (key: string) => (hashStore.has(key) ? 'hash' : valueStore.has(key) ? 'string' : 'none')),
    del: vi.fn(async (...keys: string[]) => keys.reduce((n, key) => {
      const removed = Number(valueStore.delete(key) || hashStore.delete(key));
      lockStore.delete(key);
      return n + removed;
    }, 0)),
    get: vi.fn(async (key: string) => valueStore.get(key) ?? null),
    hget: vi.fn(async (key: string, field: string) => hashStore.get(key)?.get(field) ?? null),
    hincrby: vi.fn(async (key: string, field: string, delta: number) => {
      const hash = hashStore.get(key) ?? new Map<string, string>();
      const next = Number(hash.get(field) ?? 0) + Number(delta);
      hash.set(field, String(next));
      hashStore.set(key, hash);
      return next;
    }),
  };
  mocks.redis.getRedis.mockReturnValue(redisClient);
  mocks.redis.cacheSet.mockImplementation(async (key: string, value: string) => {
    respStore.set(key, value);
  });
  mocks.redis.cacheGet.mockImplementation(async (key: string) => respStore.get(key) ?? null);
  mocks.redis.cacheDel.mockResolvedValue(undefined);

  // ── DB 查询链：定价查询走 vendorPricing；幂等 L2 兜底走 consumptionRecords ──
  consumptionLookup = () => Promise.resolve([]);
  mocks.db.select.mockImplementation(() => {
    const pricingLimit = vi.fn().mockResolvedValue([]);
    const consumptionLimit = vi.fn(consumptionLookup);
    return {
      from: vi.fn((table: unknown) => {
        if (table === mocks.schema.consumptionRecords) {
          return { where: vi.fn().mockReturnValue({ limit: consumptionLimit }) };
        }
        if (table === mocks.schema.customerBalances) {
          return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ availableBalance: '100', frozenBalance: '0' }]) }) };
        }
        return { innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: pricingLimit }) }) };
      }),
    };
  });
  mocks.db.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });

  // ── 业务默认值 ──
  // 支持跨用户用例：通过 x-test-user 头模拟不同 userId（幂等指纹含 user identity；
  // 默认 userId=1 保持既有用例行为不变）。
  mocks.apikey.apiKeyAuth.mockImplementation(async (request: any) => {
    const uid = Number(request.headers?.['x-test-user'] ?? 1);
    request.apiKeyContext = { userId: uid, apiKeyId: uid === 1 ? 11 : uid * 10, keyHash: `hash-${uid}` };
  });
  mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
  mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
  mocks.balance.freezeBalance.mockResolvedValue(undefined);
  // The gateway assertions historically count the final charge via
  // deductBalance. Keep that observable accounting hook while the actual
  // pre-consume path uses freeze/settle APIs (no Redis fallback).
  mocks.balance.settleFrozenBalance.mockImplementation(async (...args: unknown[]) => {
    await mocks.balance.deductBalance(...args);
  });
  mocks.balance.releaseFrozenBalance.mockResolvedValue(undefined);
  mocks.consumption.recordConsumption.mockResolvedValue({ id: 1 });
  mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
  mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
  mocks.circuitBreaker.isCircuitOpen.mockResolvedValue(false);
  mocks.conversation.recordConversationContext.mockResolvedValue(undefined);
  mocks.conversation.fingerprintKey.mockImplementation((k: string) => `fp-${k}`);

  vi.stubGlobal('fetch', mocks.fetch);

  app = Fastify();
  await app.register(chatRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

// ============================================================
// 非流式：同 key 二次提交
// ============================================================

describe('幂等：非流式同 key 二次提交', () => {
  it('返回首次响应 + X-Idempotent-Replay 标记，不重复扣费 / 不重复生成佣金', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const headers = { 'idempotency-key': 'idem-key-nonstream' };
    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };

    // 首次：正常处理，无回放标记
    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['x-idempotent-replay']).toBeUndefined();
    // 消费记录 requestId = 幂等键（L2 DB 兜底同键）
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'idem-key-nonstream' }));

    // 二次：回放首次响应体 + 标记
    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(JSON.parse(res2.payload)).toEqual(JSON.parse(res1.payload));

    // 不重复扣费：上游 / 扣费 / 消费记录 / 佣金各一次
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(1);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(1);
    expect(mocks.commission.generateCommissionForConsumption).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 流式：同 key 二次提交
// ============================================================

describe('幂等：流式同 key 二次提交', () => {
  it('摘要回放（SSE 单帧 + [DONE]）+ 标记，不重复计费', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamStreamResponse();

    const headers = { 'idempotency-key': 'idem-key-stream' };
    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }], stream: true };

    // 首次：SSE 转发 + 流式结算（结算在响应结束后异步完成，需等待缓存写入）
    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res1.statusCode).toBe(200);
    expect(String(res1.headers['content-type'])).toContain('text/event-stream');
    expect(res1.body).toContain('data: [DONE]');
    await vi.waitFor(() => {
      expect(respStore.has('idem:resp:idem-key-stream:1')).toBe(true);
    });

    // 二次：幂等命中 → 摘要回放 + 标记，不重复计费
    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res2.statusCode).toBe(200);
    expect(String(res2.headers['content-type'])).toContain('text/event-stream');
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(res2.body).toContain('data: [DONE]');
    const replayJson = JSON.parse(res2.body.split('\n')[0]!.replace(/^data: /, ''));
    expect(replayJson.idempotent_replay).toBe(true);
    expect(replayJson.input_tokens).toBe(5);
    expect(replayJson.output_tokens).toBe(2);
    expect(replayJson.streamed).toBe(true);

    // 流式结算仅发生一次
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(1);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 不同幂等键
// ============================================================

describe('幂等：不同幂等键', () => {
  it('各自正常处理（互不干扰）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };
    const resA = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers: { 'idempotency-key': 'key-a' }, payload });
    const resB = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers: { 'idempotency-key': 'key-b' }, payload });

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    expect(resB.headers['x-idempotent-replay']).toBeUndefined();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(2);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(2);
  });

  it('未传 Idempotency-Key → 每次生成独立 requestId，均正常处理', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };
    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload });
    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload });
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-idempotent-replay']).toBeUndefined();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// DB 唯一约束兜底 / Redis 降级
// ============================================================

describe('幂等：DB 唯一约束兜底与 Redis 降级', () => {
  it('Redis 失效时重复 insert → 409 幂等提示而非 500', async () => {
    // Redis 不可用 → 首层失效，两次请求都放行
    mocks.redis.getRedis.mockReturnValue(null);
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();
    // 第二次 insert 触发 consumption_records.request_id 唯一约束冲突（23505）
    mocks.consumption.recordConsumption
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "consumption_records_request_id_unique"' });

    const headers = { 'idempotency-key': 'idem-key-conflict' };
    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };

    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res2.statusCode).toBe(409);
    expect(res2.statusCode).not.toBe(500);
    const errBody = res2.json();
    expect(errBody.error.code).toBe(409);
    expect(errBody.error.type).toBe('idempotency_conflict');
  });

  it('Redis 不可用 → 降级放行：请求正常处理（不阻断主链路）', async () => {
    // Redis 不可用 → 首层锁 / 缓存全部降级（getRedis null + cacheGet null + cacheSet no-op）
    mocks.redis.getRedis.mockReturnValue(null);
    mocks.redis.cacheGet.mockResolvedValue(null);
    mocks.redis.cacheSet.mockResolvedValue(undefined);
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'idempotency-key': 'idem-key-degraded' },
      payload: { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] },
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(1);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(1);
    // 降级时无锁可释放、无缓存写入，但不应报错
    expect(respStore.size).toBe(0);
  });

  it('Redis 缓存丢失（崩溃/重启）→ L2 查 consumption_records 补偿回放摘要', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const headers = { 'idempotency-key': 'idem-key-dbfallback' };
    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };

    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res1.statusCode).toBe(200);

    // 模拟缓存丢失：响应缓存清空，但幂等锁仍在（同 key 二次提交仍判重复）
    respStore.clear();

    // L2 DB 兜底：consumption_records 中已存在该 requestId 的记录
    consumptionLookup = () => Promise.resolve([{
      requestId: 'idem-key-dbfallback',
      model: 'deepseek-v3',
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
      cost: '0.00005',
      finishReason: 'stop',
      streamed: false,
    }]);

    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    // DB 兜底无完整 body → 返回摘要
    const body2 = res2.json();
    expect(body2.idempotent_replay).toBe(true);
    expect(body2.input_tokens).toBe(5);
    expect(body2.output_tokens).toBe(2);

    // 未重复扣费 + 补偿写回缓存（user-scoped：idem:resp:{key}:{userId}）
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(1);
    expect(respStore.has('idem:resp:idem-key-dbfallback:1')).toBe(true);
  });
});

// ============================================================
// 幂等指纹：跨用户同 key 不泄露 / 异 body 同 key 409 / 消费不重复
// ============================================================

describe('幂等指纹安全', () => {
  it('跨用户同 Idempotency-Key → 不泄露首次请求结果（各自独立处理，不回放）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const headersA = { 'idempotency-key': 'idem-cross-user', 'x-test-user': '1' };
    const headersB = { 'idempotency-key': 'idem-cross-user', 'x-test-user': '2' };
    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'secret-conversation' }] };

    // 用户 A（userId=1）：首次请求 → 正常处理
    const resA = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers: headersA, payload });
    expect(resA.statusCode).toBe(200);
    expect(resA.headers['x-idempotent-replay']).toBeUndefined();

    // 用户 B（userId=2）使用相同 Idempotency-Key + 相同 body：必须独立处理，不得回放 A 的结果
    const resB = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers: headersB, payload });
    expect(resB.statusCode).toBe(200);
    // B 无回放标记 = 未拿到 A 的首次响应（无泄露）
    expect(resB.headers['x-idempotent-replay']).toBeUndefined();

    // 上游/扣费/消费各 2 次（各自真实消费一次，A 的结果未被打到 B 头上）
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(2);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(2);
    // 两个用户作用域下的响应缓存彼此独立
    expect(respStore.has('idem:resp:idem-cross-user:1')).toBe(true);
    expect(respStore.has('idem:resp:idem-cross-user:2')).toBe(true);
  });

  it('同用户同 Idempotency-Key 异 body → 409 IDEMPOTENCY_CONFLICT，不回放、不重复消费', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const headers = { 'idempotency-key': 'idem-diff-body' };

    // 首次：body X → 正常处理
    const payloadX = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'first-prompt' }] };
    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload: payloadX });
    expect(res1.statusCode).toBe(200);

    // 二次：同一 key 但 body 不同（异摘要）→ 409，不得回放首次响应，也不得再次扣费
    const payloadY = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'second-prompt' }] };
    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload: payloadY });
    expect(res2.statusCode).toBe(409);
    expect(res2.statusCode).not.toBe(500);
    const errBody = res2.json();
    expect(errBody.error.type).toBe('idempotency_conflict');
    expect(errBody.error.code).toBe(409);

    // 未回放首次结果、未重复消费（上游/扣费/消费各 1 次）
    expect(res2.headers['x-idempotent-replay']).toBeUndefined();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(1);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(1);
  });

  it('同用户同 Idempotency-Key 同 body（键序不同）→ 指纹一致正常回放，消费记录不重复', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const headers = { 'idempotency-key': 'idem-same-body-reordered' };
    const payload1 = {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'deepseek-v3',
    };
    const payload2 = {
      model: 'deepseek-v3',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload: payload1 });
    expect(res1.statusCode).toBe(200);

    // 键序无关：payload1/payload2 语义相同 → 同指纹 → 正常回放
    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload: payload2 });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(JSON.parse(res2.payload)).toEqual(JSON.parse(res1.payload));

    // 消费/扣费不重复：各自只发生一次
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.balance.deductBalance).toHaveBeenCalledTimes(1);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledTimes(1);
  });
});
