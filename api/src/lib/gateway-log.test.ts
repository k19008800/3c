/**
 * P3-2 网关结构化日志测试 — 字段完整性 / 慢查询 hook / requestId 全链路 / chat 路由端到端
 *
 * 覆盖（docs/iteration-plan-v2.md P3-2 测试要求）：
 * - 结构化日志字段完整性：logGatewayRequest 输出 requestId/model/supplier/keyId/latencyMs/usage/cost/status
 * - 慢查询 onResponse hook：慢响应触发日志、快响应不触发、阈值可注入
 * - requestId 全链路：onRequest 生成/透传的 requestId 在响应头与后续日志一致
 * - chat 路由端到端：真实 handler 链路（mock 上游）输出完整结构化字段 + 幂等命中状态
 *
 * @see docs/iteration-plan-v2.md P3-2
 * @see coding-standards-api-db-test.md §3 测试规范
 * @module test/gateway-log
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'stream';
import pino from 'pino';
import crypto from 'crypto';
import { chatRoutes } from '../routes/chat';
import {
  logGatewayRequest,
  logSlowRequest,
  requestIdOnRequestHook,
  slowRequestOnResponseHook,
  GATEWAY_REQUEST_LOG_MSG,
  SLOW_REQUEST_LOG_MSG,
} from './gateway-log';
import type { GatewayLogFields, SlowRequestLogFields } from './gateway-log';

// ============================================================
// 测试工具：采集 pino 输出的 logger
// ============================================================

interface CaptureLogger {
  logger: pino.Logger;
  parsed: () => Array<Record<string, any>>;
  lines: () => string[];
}

/** 构造 pino logger（info 级），所有输出 JSON 行写入 lines */
function makeCaptureLogger(): CaptureLogger {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ level: 'info' }, stream);
  const parsed = () =>
    lines
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, any>;
        } catch {
          return null;
        }
      })
      .filter((x): x is Record<string, any> => x !== null);
  return { logger, parsed, lines: () => lines };
}

// ============================================================
// 1. logGatewayRequest 字段完整性（单测，直接测输出函数）
// ============================================================

describe('logGatewayRequest 结构化字段完整性', () => {
  it('输出日志对象含 requestId/model/supplier/keyId/latencyMs/usage/cost/status 全部字段', () => {
    const { logger, parsed } = makeCaptureLogger();
    const fields: GatewayLogFields = {
      requestId: 'req-complete-001',
      model: 'deepseek-v3',
      supplier: 'Test Supplier',
      keyId: 7,
      latencyMs: 123,
      usage: { input: 5, output: 2, total: 7 },
      cost: '0.00005',
      status: 'success',
      stream: false,
    };

    logGatewayRequest(logger, fields);

    const log = parsed().find((l) => l.msg === GATEWAY_REQUEST_LOG_MSG);
    expect(log).toBeDefined();
    // P3-2 验收字段逐一断言
    expect(log!.requestId).toBe('req-complete-001');
    expect(log!.model).toBe('deepseek-v3');
    expect(log!.supplier).toBe('Test Supplier');
    expect(log!.keyId).toBe(7);
    expect(log!.latencyMs).toBe(123);
    expect(log!.usage).toEqual({ input: 5, output: 2, total: 7 });
    expect(log!.cost).toBe('0.00005');
    expect(log!.status).toBe('success');
  });

  it('四种 status 值（success/failure/circuit_breaker/idempotency_hit）均可输出', () => {
    const { logger, parsed } = makeCaptureLogger();
    for (const status of ['success', 'failure', 'circuit_breaker', 'idempotency_hit'] as const) {
      logGatewayRequest(logger, { requestId: `req-${status}`, latencyMs: 1, status });
    }
    const logs = parsed().filter((l) => l.msg === GATEWAY_REQUEST_LOG_MSG);
    expect(logs.map((l) => l.status).sort()).toEqual(['circuit_breaker', 'failure', 'idempotency_hit', 'success']);
  });

  it('可选字段缺省时输出对象不报错（mock 回退 / 失败请求场景）', () => {
    const { logger, parsed } = makeCaptureLogger();
    logGatewayRequest(logger, { requestId: 'req-mock', latencyMs: 10, status: 'success' });
    const log = parsed().find((l) => l.msg === GATEWAY_REQUEST_LOG_MSG)!;
    expect(log.requestId).toBe('req-mock');
    expect(log.latencyMs).toBe(10);
    expect(log.status).toBe('success');
  });
});

describe('logSlowRequest 字段', () => {
  it('输出 slow request 日志（requestId/method/url/statusCode/latencyMs/threshold）', () => {
    const { logger, parsed } = makeCaptureLogger();
    const fields: SlowRequestLogFields = {
      requestId: 'slow-rid-1',
      method: 'POST',
      url: '/v1/chat/completions',
      statusCode: 200,
      latencyMs: 4200,
      slowRequestThresholdMs: 3000,
    };
    logSlowRequest(logger, fields);
    const log = parsed().find((l) => l.msg === SLOW_REQUEST_LOG_MSG)!;
    expect(log.requestId).toBe('slow-rid-1');
    expect(log.method).toBe('POST');
    expect(log.url).toBe('/v1/chat/completions');
    expect(log.statusCode).toBe(200);
    expect(log.latencyMs).toBe(4200);
    expect(log.slowRequestThresholdMs).toBe(3000);
  });
});

// ============================================================
// 2. 慢查询 onResponse hook（快/慢响应）
// ============================================================

describe('慢查询 onResponse hook', () => {
  it('慢响应 → 触发慢查询日志（含路径/耗时/requestId/阈值），响应头回写 x-request-id', async () => {
    const { logger, parsed } = makeCaptureLogger();
    const app = Fastify({
      loggerInstance: logger,
      requestIdHeader: 'x-request-id',
      genReqId: () => 'gen-rid-slow',
    });
    app.addHook('onRequest', requestIdOnRequestHook);
    app.addHook('onResponse', slowRequestOnResponseHook({ thresholdMs: 50 }));
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true };
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/slow',
      headers: { 'x-request-id': 'client-rid-slow' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('client-rid-slow');

    const slowLogs = parsed().filter((l) => l.msg === SLOW_REQUEST_LOG_MSG);
    expect(slowLogs).toHaveLength(1);
    expect(slowLogs[0]!.requestId).toBe('client-rid-slow');
    expect(slowLogs[0]!.method).toBe('GET');
    expect(slowLogs[0]!.url).toBe('/slow');
    expect(slowLogs[0]!.statusCode).toBe(200);
    expect(Number(slowLogs[0]!.latencyMs)).toBeGreaterThanOrEqual(50);
    expect(slowLogs[0]!.slowRequestThresholdMs).toBe(50);

    await app.close();
  });

  it('快响应 → 不触发慢查询日志', async () => {
    const { logger, parsed } = makeCaptureLogger();
    const app = Fastify({
      loggerInstance: logger,
      requestIdHeader: 'x-request-id',
      genReqId: () => 'gen-rid-fast',
    });
    app.addHook('onRequest', requestIdOnRequestHook);
    app.addHook('onResponse', slowRequestOnResponseHook({ thresholdMs: 50 }));
    app.get('/fast', async () => ({ ok: true }));
    await app.ready();

    await app.inject({ method: 'GET', url: '/fast' });
    expect(parsed().filter((l) => l.msg === SLOW_REQUEST_LOG_MSG)).toHaveLength(0);

    await app.close();
  });
});

// ============================================================
// 3. requestId 全链路：onRequest 生成/透传 → 响应头 + 后续日志一致
// ============================================================

describe('requestId 全链路一致性', () => {
  it('未传 x-request-id → onRequest 生成，响应头与慢查询日志同一 requestId', async () => {
    const { logger, parsed } = makeCaptureLogger();
    const app = Fastify({
      loggerInstance: logger,
      requestIdHeader: 'x-request-id',
      genReqId: () => 'gen-rid-1',
    });
    app.addHook('onRequest', requestIdOnRequestHook);
    app.addHook('onResponse', slowRequestOnResponseHook({ thresholdMs: 50 }));
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true };
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/slow' });
    expect(res.headers['x-request-id']).toBe('gen-rid-1');

    const slowLogs = parsed().filter((l) => l.msg === SLOW_REQUEST_LOG_MSG);
    expect(slowLogs).toHaveLength(1);
    expect(slowLogs[0]!.requestId).toBe('gen-rid-1');
    // 与响应头一致 = 全链路同一把 requestId
    expect(slowLogs[0]!.requestId).toBe(res.headers['x-request-id']);

    await app.close();
  });

  it('传 x-request-id → 透传生效，响应头与日志一致', async () => {
    const { logger, parsed } = makeCaptureLogger();
    const app = Fastify({
      loggerInstance: logger,
      requestIdHeader: 'x-request-id',
      genReqId: () => 'should-not-be-used',
    });
    app.addHook('onRequest', requestIdOnRequestHook);
    app.addHook('onResponse', slowRequestOnResponseHook({ thresholdMs: 50 }));
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true };
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/slow',
      headers: { 'x-request-id': 'trace-client-abc' },
    });
    expect(res.headers['x-request-id']).toBe('trace-client-abc');

    const slowLogs = parsed().filter((l) => l.msg === SLOW_REQUEST_LOG_MSG);
    expect(slowLogs[0]!.requestId).toBe('trace-client-abc');

    await app.close();
  });
});

// ============================================================
// 4. chat 路由端到端：真实 handler 链路输出结构化日志
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
  },
  routing: { selectChannel: vi.fn() },
  circuitBreaker: { recordChannelResult: vi.fn(), isCircuitOpen: vi.fn() },
  balance: { getBalance: vi.fn(), deductBalance: vi.fn(), addBalance: vi.fn(), initBalance: vi.fn() },
  consumption: { recordConsumption: vi.fn(), getUserConsumptionStats: vi.fn() },
  commission: { generateCommissionForConsumption: vi.fn() },
  conversation: { recordConversationContext: vi.fn(), fingerprintKey: vi.fn() },
  apikey: { apiKeyAuth: vi.fn() },
  redis: { getRedis: vi.fn(), cacheGet: vi.fn(), cacheSet: vi.fn(), cacheDel: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock('../db', () => ({
  db: mocks.db,
  schema: mocks.schema,
}));
vi.mock('../services/auth/apikey', () => ({
  apiKeyAuth: mocks.apikey.apiKeyAuth,
  hashApiKey: vi.fn(),
  extractApiKeyFromHeader: vi.fn(),
  verifyApiKey: vi.fn(),
}));
vi.mock('../services/upstream/routing', () => ({ selectChannel: mocks.routing.selectChannel }));
vi.mock('../services/upstream/circuit-breaker', () => ({
  recordChannelResult: mocks.circuitBreaker.recordChannelResult,
  isCircuitOpen: mocks.circuitBreaker.isCircuitOpen,
}));
vi.mock('../services/billing/balance', () => ({
  getBalance: mocks.balance.getBalance,
  deductBalance: mocks.balance.deductBalance,
  addBalance: mocks.balance.addBalance,
  initBalance: mocks.balance.initBalance,
}));
vi.mock('../services/billing/consumption-log', () => ({
  recordConsumption: mocks.consumption.recordConsumption,
  getUserConsumptionStats: mocks.consumption.getUserConsumptionStats,
}));
vi.mock('../services/agent/commission', () => ({
  generateCommissionForConsumption: mocks.commission.generateCommissionForConsumption,
}));
vi.mock('../services/audit/conversation-context', () => ({
  recordConversationContext: mocks.conversation.recordConversationContext,
  fingerprintKey: mocks.conversation.fingerprintKey,
}));
vi.mock('../lib/redis', () => ({
  getRedis: mocks.redis.getRedis,
  cacheGet: mocks.redis.cacheGet,
  cacheSet: mocks.redis.cacheSet,
  cacheDel: mocks.redis.cacheDel,
}));
vi.mock('../services/rate-limit', () => ({
  enforceRateLimitPreHandler: vi.fn(async () => {}),
}));

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

/** mock 上游非流式 JSON 响应（每次调用返回新 Response，body 只能读一次） */
function mockUpstreamJsonResponse() {
  mocks.fetch.mockImplementation(
    async () => new Response(JSON.stringify(makeUpstreamChatResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
}

/** 构造带 requestId hook 的 chat 应用（logger 采集输出） */
async function buildChatApp(): Promise<{ app: FastifyInstance; capture: CaptureLogger }> {
  const capture = makeCaptureLogger();
  // Fastify({ loggerInstance }) 会推断出带 pino Logger 泛型的实例类型，与基础
  // FastifyInstance 存在逆变差异（childLoggerFactory），跨赋值需经 unknown 收窄。
  const app = Fastify({
    loggerInstance: capture.logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  }) as unknown as FastifyInstance;
  app.addHook('onRequest', requestIdOnRequestHook);
  await app.register(chatRoutes);
  await app.ready();
  return { app, capture };
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.resetAllMocks();

  // Redis 幂等锁 / 响应缓存
  const lockStore = new Map<string, string>();
  const respStore = new Map<string, string>();
  const redisClient = {
    set: vi.fn(async (key: string, token: string) => {
      if (lockStore.has(key)) return null;
      lockStore.set(key, token);
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (lockStore.get(key) === token) {
        lockStore.delete(key);
        return 1;
      }
      return 0;
    }),
  };
  mocks.redis.getRedis.mockReturnValue(redisClient);
  mocks.redis.cacheSet.mockImplementation(async (key: string, value: string) => {
    respStore.set(key, value);
  });
  mocks.redis.cacheGet.mockImplementation(async (key: string) => respStore.get(key) ?? null);
  mocks.redis.cacheDel.mockResolvedValue(undefined);

  // DB 查询链
  mocks.db.select.mockImplementation(() => {
    const pricingLimit = vi.fn().mockResolvedValue([]);
    const consumptionLimit = vi.fn().mockResolvedValue([]);
    return {
      from: vi.fn((table: unknown) => {
        if (table === mocks.schema.consumptionRecords) {
          return { where: vi.fn().mockReturnValue({ limit: consumptionLimit }) };
        }
        return { innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: pricingLimit }) }) };
      }),
    };
  });
  mocks.db.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });

  // 业务默认值
  mocks.apikey.apiKeyAuth.mockImplementation(async (request: any) => {
    request.apiKeyContext = { userId: 1, apiKeyId: 11, keyHash: 'test-hash' };
  });
  mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
  mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
  mocks.consumption.recordConsumption.mockResolvedValue({ id: 1 });
  mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
  mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
  mocks.circuitBreaker.isCircuitOpen.mockResolvedValue(false);
  mocks.conversation.recordConversationContext.mockResolvedValue(undefined);
  mocks.conversation.fingerprintKey.mockImplementation((k: string) => `fp-${k}`);

  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined as unknown as FastifyInstance;
  }
  vi.unstubAllGlobals();
});

describe('chat 路由网关结构化日志（端到端）', () => {
  it('成功请求输出完整结构化字段，requestId 与 x-request-id 透传一致', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const built = await buildChatApp();
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'x-request-id': 'e2e-rid-001' },
      payload: { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(200);

    const logs = built.capture.parsed().filter((l) => l.msg === GATEWAY_REQUEST_LOG_MSG);
    expect(logs).toHaveLength(1);
    const g = logs[0]!;
    // P3-2 验收字段：requestId/model/supplier/keyId/latencyMs/usage/cost/status
    expect(g.requestId).toBe('e2e-rid-001'); // 无 Idempotency-Key → 回退 request.requestId（x-request-id 透传）
    expect(g.model).toBe('deepseek-v3');
    expect(g.supplier).toBe('Test Supplier');
    expect(g.keyId).toBe(7);
    expect(typeof g.latencyMs).toBe('number');
    expect(g.latencyMs).toBeGreaterThanOrEqual(0);
    expect(g.usage).toEqual({ input: 5, output: 2, total: 7 });
    expect(typeof g.cost).toBe('string');
    expect(g.status).toBe('success');
    // 响应头 x-request-id 与日志 requestId 一致（全链路）
    expect(res.headers['x-request-id']).toBe('e2e-rid-001');
  });

  it('幂等命中（同 Idempotency-Key 二次提交）→ 第二次网关日志 status=idempotency_hit', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mockUpstreamJsonResponse();

    const built = await buildChatApp();
    app = built.app;

    const headers = { 'idempotency-key': 'idem-e2e-dup' };
    const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };

    const res1 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-idempotent-replay']).toBe('true');

    const logs = built.capture.parsed().filter((l) => l.msg === GATEWAY_REQUEST_LOG_MSG);
    expect(logs).toHaveLength(2);
    expect(logs[0]!.status).toBe('success');
    expect(logs[1]!.status).toBe('idempotency_hit');
    expect(logs[1]!.requestId).toBe('idem-e2e-dup');
  });

  it('上游失败透传（500）→ 网关日志 status=failure 且带 statusCode/error', async () => {
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockImplementation(
      async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
    );

    const built = await buildChatApp();
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'x-request-id': 'e2e-rid-fail' },
      payload: { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(500);

    const logs = built.capture.parsed().filter((l) => l.msg === GATEWAY_REQUEST_LOG_MSG);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.requestId).toBe('e2e-rid-fail');
    expect(logs[0]!.status).toBe('failure');
    expect(logs[0]!.statusCode).toBe(500);
    expect(String(logs[0]!.error)).toContain('UPSTREAM_ERROR');
  });
});
