/**
 * G3 网关卡面契约测试 — Key 细粒度权限 preHandler【真实拦截】（PRD-§20.4.1 / 20.4.2 / 20.4.3）
 *
 * 与 services/pipeline/integration.test.ts 的差异：那里把
 * `enforceKeyPermissionsPreHandler` 整个 `vi.fn()` 掉（链路级替身）；
 * 这里【不 mock】key-permissions，走真实 `enforceKeyPermissionsPreHandler`，
 * 仅 mock 外部边界（apiKeyAuth 注入 apiKeyContext、上游 fetch、Redis 计数、
 * 四级限流/幂等/预扣等跨切面守卫），用 bare Fastify + openaiCompatRoutes 装配。
 *
 * 契约（拒绝即 4xx，链路在 preHandler 中断，上游不被调用）：
 *   1. allowedModels=['model-a'] 的 Key 请求模型 model-b → 403 MODEL_NOT_ALLOWED 语义，
 *      且上游 fetch 未被调用（PRD-§20.4.1 模型白名单）；
 *   2. allowedIps=['203.0.113.10'] 的 Key 从白名单外 IP(198.51.100.5) 请求 → 403
 *      IP_NOT_ALLOWED 语义（PRD-§20.4.2 来源 IP 白名单）；
 *   3. dailyTokenLimit=10、今日累计 11 的 Key 请求 → 429 DAILY_TOKEN_LIMIT_EXCEEDED 语义
 *      （PRD-§20.4.3 日 Token 限额）。
 *
 * 响应体口径（见 key-permissions.ts preHandler）：拒绝时
 * `{ error: { message, type: 'permission_error'|'rate_limit_error', code: <HTTP 状态码> } }`。
 *
 * @module test/key-permissions-gateway
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
  // Redis 计数边界：multi().exec() 返回值可按用例编程（日 Token 维度）
  redis: { exec: vi.fn(), incrby: vi.fn(), incr: vi.fn(), pexpire: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock('../src/db', () => ({
  db: mocks.db,
  // 只提供路由代码会访问的列占位对象（与 openai-compat.test.ts 一致）
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
// apiKeyAuth：真实 DB 校验无关紧要，直接注入 apiKeyContext（含 §20.4 权限列）。
// 注意：这里【没有】mock `../src/services/security/key-permissions`，
// enforceKeyPermissionsPreHandler 走真实实现——这正是本文件与 integration.test.ts 的区别。
vi.mock('../src/services/auth/apikey', () => ({
  apiKeyAuth: mocks.apikey.apiKeyAuth,
  hashApiKey: vi.fn(),
  extractApiKeyFromHeader: vi.fn(),
  verifyApiKey: vi.fn(),
}));
// 四级限流（跨切面守卫）整体 mock，避免真实 Redis/DB 计数干扰；
// estimateRequestTokens 固定为 1（TPM/日 Token 权重）。
vi.mock('../src/services/rate-limit', () => ({
  enforceRateLimitPreHandler: vi.fn(async () => {}),
  estimateRequestTokens: vi.fn(() => 1),
  enforceRateLimit: vi.fn(),
  isExceptionActive: vi.fn(() => false),
}));
vi.mock('../src/services/idempotency', () => ({
  resolveIdempotencyKey: vi.fn((_req: unknown, fallback: string) => fallback),
  acquireIdempotencyLock: vi.fn().mockResolvedValue({ status: 'degraded' }),
  releaseIdempotentResponse: vi.fn().mockResolvedValue(undefined),
  replayIdempotentRequest: vi.fn().mockResolvedValue('none' as never),
  cacheIdempotentResponse: vi.fn().mockResolvedValue(undefined),
  isIdempotentUniqueViolation: vi.fn(() => false),
  buildIdempotentResponse: vi.fn((p: Record<string, unknown>) => p),
}));
vi.mock('../src/services/billing/pre-consume', () => ({
  preConsume: vi.fn().mockResolvedValue({ mode: 'bypass', amount: 0, requestId: 'test' }),
  releasePreConsume: vi.fn().mockResolvedValue(undefined),
  settlePreConsume: vi.fn().mockResolvedValue(undefined),
}));
// Redis 边界替身：getRedis() 返回一个可编程的 multi/exec。
// 仅日 Token/RPM/TPM 维度用到；模型/IP/Referer 判定为纯函数，不触达 Redis。
vi.mock('../src/lib/redis.js', () => ({
  getRedis: () => ({
    multi: () => ({
      incr: mocks.redis.incr,
      incrby: mocks.redis.incrby,
      pexpire: mocks.redis.pexpire,
      exec: mocks.redis.exec,
    }),
  }),
}));

// ============================================================
// Test helpers
// ============================================================

/** 默认权限配置（全部不限制），按用例覆盖 */
type CtxOverrides = Partial<{
  allowedModels: string[] | null;
  blockedModels: string[] | null;
  allowedIps: string[] | null;
  allowedReferers: string[] | null;
  dailyTokenLimit: number | null;
  rpmLimit: number | null;
  tpmLimit: number | null;
}>;

function injectKeyCtx(overrides: CtxOverrides, apiKeyId = 11) {
  mocks.apikey.apiKeyAuth.mockImplementation(async (request: any) => {
    request.apiKeyContext = {
      apiKeyId,
      userId: 1,
      keyHash: 'test-hash',
      allowedModels: null,
      blockedModels: null,
      allowedIps: null,
      allowedReferers: null,
      dailyTokenLimit: null,
      rpmLimit: null,
      tpmLimit: null,
      ...overrides,
    };
  });
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  // 默认：无任何限制（allow）。用例再按需覆盖。
  injectKeyCtx({});
  mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
  mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));

  app = Fastify();
  await app.register(openaiCompatRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

// ============================================================
// G3-1：模型白名单（探针）— allowedModels=['model-a'] 请求 model-b → 403 且上游未调用
// ============================================================
describe('G3-1 模型白名单（PRD-§20.4.1）', () => {
  it('白名单外模型 → 403 permission_error，且上游 fetch 未被调用', async () => {
    injectKeyCtx({ allowedModels: ['model-a-allowed'] });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/embeddings',
      payload: { model: 'model-b-denied', input: 'hello' },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.type).toBe('permission_error');
    expect(body.error.code).toBe(403);
    // 对外 message 携带被拒模型名（内部机器码 MODEL_NOT_ALLOWED 不外露）
    expect(body.error.message).toContain('model-b-denied');
    // 关键：链路在 preHandler 中断，转发/记账均未发生
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
  });
});

// ============================================================
// G3-2：来源 IP 白名单 — allowedIps=['203.0.113.10'] 从白名单外 IP 请求 → 403
// ============================================================
describe('G3-2 来源 IP 白名单（PRD-§20.4.2）', () => {
  it('白名单外来源 IP → 403 permission_error', async () => {
    injectKeyCtx({ allowedIps: ['203.0.113.10'] });

    // light-my-request remoteAddress → Fastify request.ip（trust proxy 关闭时取 socket 地址）
    const res = await app.inject({
      method: 'POST',
      url: '/v1/embeddings',
      remoteAddress: '198.51.100.5', // TEST-NET-2，不在白名单
      payload: { model: 'some-model', input: 'hello' },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.type).toBe('permission_error');
    expect(body.error.message).toContain('来源 IP');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

// ============================================================
// G3-3：日 Token 限额 — dailyTokenLimit=10、今日累计 11 → 429
// ============================================================
describe('G3-3 日 Token 限额（PRD-§20.4.3）', () => {
  it('今日累计超过 dailyTokenLimit → 429 rate_limit_error，且上游未调用', async () => {
    // 其余维度全部放开，仅日 Token 限额生效
    injectKeyCtx({ dailyTokenLimit: 10 });
    // Redis multi().exec() 返回 incrby 结果：今日累计 = 11（> 10）
    mocks.redis.exec.mockResolvedValue([[null, 11]]);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/embeddings',
      payload: { model: 'any-model', input: 'hello' },
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.code).toBe(429);
    expect(body.error.message).toContain('今日');
    // 日 Token 超限在 preHandler 中断，未触达上游
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
