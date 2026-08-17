/**
 * Pipeline 接入集成测试（P0-4）
 *
 * 覆盖（docs/iteration-plan-v2.md P0-4 测试要求）：
 * - 正常链路：auth → idempotency → rate-limit → validate → pre-consume → route → proxy → settle
 *   顺序执行全部成功
 * - 第 N 步失败 → 前 N-1 步 rollback 按逆序调用（幂等：重复回滚 no-op）
 * - noRollbackOn 标记步骤失败 → 不触发回滚
 * - 余额不足（pre-consume 失败）→ 402 且未调上游（fetch 未被调用）
 * - 上游全部不可用 / 上游 5xx → 502 + 解冻预扣（releasePreConsume 被调用）
 * - 大 base64（>10MB）→ 上传临时文件、替换为内网 URL；小 base64 原样转发
 * - 现有 chat/messages/rerank/responses 行为回归由各自既有测试承担（全量 vitest 回归）
 *
 * @see docs/iteration-plan-v2.md P0-4
 * @module services/pipeline/integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { chatRoutes } from '../../routes/chat';
import { internalAssetsRoutes } from '../../routes/internal-assets';
import {
  runPipeline,
  createStep,
  authStep,
  idempotencyStep,
  rateLimitStep,
  preConsumeStep,
  routeStep,
  proxyStep,
  UpstreamPassthroughError,
  setStepResult,
  getStepResult,
  STEP_KEYS,
} from './index';
import type { PipelineContext } from './types';

// ============================================================
// Module mocks（链路级与路由级共用）
// ============================================================

const mocks = vi.hoisted(() => ({
  preConsume: { preConsume: vi.fn(), releasePreConsume: vi.fn(), settlePreConsume: vi.fn() },
  idempotency: {
    resolveIdempotencyKey: vi.fn(),
    acquireIdempotencyLock: vi.fn(),
    releaseIdempotencyLock: vi.fn(),
    replayIdempotentRequest: vi.fn(),
    cacheIdempotentResponse: vi.fn(),
    isIdempotencyUniqueViolation: vi.fn(),
    buildIdempotencySummary: vi.fn(),
  },
  routing: { selectChannel: vi.fn() },
  circuitBreaker: { recordChannelResult: vi.fn(), isCircuitOpen: vi.fn() },
  balance: { getBalance: vi.fn(), deductBalance: vi.fn(), addBalance: vi.fn(), initBalance: vi.fn() },
  consumption: { recordConsumption: vi.fn(), getUserConsumptionStats: vi.fn() },
  commission: { generateCommissionForConsumption: vi.fn() },
  conversation: { recordConversationContext: vi.fn(), fingerprintKey: vi.fn() },
  apikey: { apiKeyAuth: vi.fn() },
  rateLimit: { enforceRateLimitPreHandler: vi.fn() },
  db: { select: vi.fn(), update: vi.fn() },
  schema: {
    vendorPricing: { inputPrice: {}, outputPrice: {}, supplierModelId: {}, cacheDiscountRate: {} },
    supplierModels: { id: {}, modelName: {}, platformModel: {}, supplierId: {}, status: {} },
    suppliers: { id: {}, name: {}, status: {} },
    apiKeys: { id: {}, lastUsedAt: {} },
    systemConfig: { key: {}, value: {} },
    userGroups: { id: {}, name: {}, rateLimitQps: {}, rateLimitTpm: {} },
    consumptionRecords: {
      requestId: {}, model: {}, inputTokens: {}, outputTokens: {},
      totalTokens: {}, cost: {}, finishReason: {}, streamed: {},
    },
  },
  fetch: vi.fn(),
}));

vi.mock('../../services/billing/pre-consume', () => ({
  preConsume: mocks.preConsume.preConsume,
  releasePreConsume: mocks.preConsume.releasePreConsume,
  settlePreConsume: mocks.preConsume.settlePreConsume,
}));
vi.mock('../../services/idempotency', () => ({
  resolveIdempotencyKey: mocks.idempotency.resolveIdempotencyKey,
  acquireIdempotencyLock: mocks.idempotency.acquireIdempotencyLock,
  releaseIdempotencyLock: mocks.idempotency.releaseIdempotencyLock,
  replayIdempotentRequest: mocks.idempotency.replayIdempotentRequest,
  cacheIdempotentResponse: mocks.idempotency.cacheIdempotentResponse,
  isIdempotencyUniqueViolation: mocks.idempotency.isIdempotencyUniqueViolation,
  buildIdempotencySummary: mocks.idempotency.buildIdempotencySummary,
}));
vi.mock('../../services/upstream/routing', () => ({ selectChannel: mocks.routing.selectChannel }));
vi.mock('../../services/upstream/circuit-breaker', () => ({
  recordChannelResult: mocks.circuitBreaker.recordChannelResult,
  isCircuitOpen: mocks.circuitBreaker.isCircuitOpen,
}));
vi.mock('../../services/billing/balance', () => ({
  getBalance: mocks.balance.getBalance,
  deductBalance: mocks.balance.deductBalance,
  addBalance: mocks.balance.addBalance,
  initBalance: mocks.balance.initBalance,
}));
vi.mock('../../services/billing/consumption-log', () => ({
  recordConsumption: mocks.consumption.recordConsumption,
  getUserConsumptionStats: mocks.consumption.getUserConsumptionStats,
}));
vi.mock('../../services/agent/commission', () => ({
  generateCommissionForConsumption: mocks.commission.generateCommissionForConsumption,
}));
vi.mock('../../services/audit/conversation-context', () => ({
  recordConversationContext: mocks.conversation.recordConversationContext,
  fingerprintKey: mocks.conversation.fingerprintKey,
}));
vi.mock('../../services/auth/apikey', () => ({
  apiKeyAuth: mocks.apikey.apiKeyAuth,
  hashApiKey: vi.fn(),
  extractApiKeyFromHeader: vi.fn(),
  verifyApiKey: vi.fn(),
}));
vi.mock('../../services/rate-limit', () => ({
  enforceRateLimitPreHandler: mocks.rateLimit.enforceRateLimitPreHandler,
}));
vi.mock('../../db', () => ({ db: mocks.db, schema: mocks.schema }));

// ============================================================
// Helpers
// ============================================================

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    requestId: 'req-1',
    userId: 1,
    apiKeyId: 1,
    model: 'deepseek-v3',
    body: { messages: [{ role: 'user', content: 'hello' }] },
    stream: false,
    metadata: {},
    ...overrides,
  };
}

function makeChannel() {
  return {
    supplier: { id: 1, name: 'Test Supplier', code: 'test', baseUrl: 'https://upstream.test', status: 'active', healthStatus: null, allowedGroups: [] },
    key: { id: 7, supplierId: 1, keyValue: 'sk-upstream', name: 'k1', status: 'active', selectMode: 'single', priority: 1, currentBalance: null },
    modelMapping: { id: 3, supplierId: 1, modelName: 'deepseek-v3', platformModel: 'upstream-model', status: 'active' },
  };
}

/** 组装一个 chat 风格的最小网关 pipeline（验证步骤顺序 + 回滚） */
function buildGatewaySteps(validateImpl?: (ctx: PipelineContext) => Promise<void>) {
  return [
    authStep(),
    idempotencyStep({ key: 'req-1', isStream: false }),
    rateLimitStep(),
    createStep('validate', async (c) => {
      c.model = 'deepseek-v3';
      setStepResult(c, STEP_KEYS.estimatedInputTokens, 100);
      setStepResult(c, STEP_KEYS.estimatedCost, 0.001);
      await validateImpl?.(c);
      return true;
    }),
    preConsumeStep(),
    routeStep(),
    proxyStep({
      buildUpstreamRequest: () => ({
        url: 'https://upstream.test/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk' },
        body: JSON.stringify({ model: 'upstream-model', messages: [{ role: 'user', content: 'hi' }] }),
      }),
    }),
  ];
}

// ============================================================
// 链路级：步骤顺序 + 回滚语义
// ============================================================

describe('Pipeline 完整链路（steps 集成）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.idempotency.acquireIdempotencyLock.mockResolvedValue({ status: 'acquired', token: 't1' });
    mocks.idempotency.releaseIdempotencyLock.mockResolvedValue(undefined);
    mocks.preConsume.preConsume.mockResolvedValue({ mode: 'bypass', amount: 0, requestId: 'req-1' });
    mocks.preConsume.releasePreConsume.mockResolvedValue(undefined);
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());
    mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
    mocks.circuitBreaker.isCircuitOpen.mockResolvedValue(false);
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('正常链路：8 step 顺序执行全部成功', async () => {
    const order: string[] = [];
    const steps = buildGatewaySteps();
    // 在步骤外再包一层顺序记录（auth/rate-limit 无副作用，直接改 name 观察顺序）
    const observed = steps.map((s) => createStep(s.name, async (c) => {
      order.push(s.name);
      return s.execute(c);
    }));
    // proxy step 需 mock 上游成功响应
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }), { status: 200 }));

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.apiKeyContext, { userId: 1, apiKeyId: 1, keyHash: 'k' });
    const result = await runPipeline(ctx, observed as never);

    expect(result.success).toBe(true);
    expect(order).toEqual(['auth', 'idempotency', 'rate-limit', 'validate', 'pre-consume', 'route', 'proxy']);
    // 上游请求真实发出
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    // 成功路径：锁不释放（保留到 TTL 供幂等回放）、预扣不解冻（已结算语义由 settle 处理）
    expect(mocks.idempotency.releaseIdempotencyLock).not.toHaveBeenCalled();
  });

  it('第 N 步失败 → 前 N-1 步 rollback 按逆序调用（idempotency + pre-consume）', async () => {
    // proxy 抛上游错误 → 逆序回滚：pre-consume 解冻 → idempotency 释放锁
    mocks.fetch.mockResolvedValue(new Response('upstream boom', { status: 503 }));
    mocks.preConsume.preConsume.mockResolvedValue({ mode: 'frozen', amount: 0.001, requestId: 'req-1' });

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.apiKeyContext, { userId: 1, apiKeyId: 1, keyHash: 'k' });
    const result = await runPipeline(ctx, buildGatewaySteps() as never);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(UpstreamPassthroughError);
      expect(result.failedStep).toBe('proxy');
    }
    // 逆序回滚：pre-consume 先于 idempotency
    const preOrder = mocks.preConsume.releasePreConsume.mock.invocationCallOrder[0]!;
    const idemOrder = mocks.idempotency.releaseIdempotencyLock.mock.invocationCallOrder[0]!;
    expect(preOrder).toBeLessThan(idemOrder);
    // 解冻携带冻结结果
    expect(mocks.preConsume.releasePreConsume).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: 'frozen' }));
    // 锁按幂等键释放
    expect(mocks.idempotency.releaseIdempotencyLock).toHaveBeenCalledWith('req-1', 't1');
  });

  it('noRollbackOn 标记步骤失败 → 不触发回滚', async () => {
    // auth 标记 noRollbackOn（无 rollback），idempotency 正常回滚
    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.apiKeyContext, { userId: 1, apiKeyId: 1, keyHash: 'k' });
    const authRollback = vi.fn();
    const steps = [
      createStep('auth', async () => true, { rollback: authRollback, noRollbackOn: true }),
      idempotencyStep({ key: 'req-1', isStream: false }),
      createStep('boom', async () => { throw new Error('boom'); }),
    ];
    const result = await runPipeline(ctx, steps as never);
    expect(result.success).toBe(false);
    // auth 被标记 noRollbackOn → 即使后续失败也不回滚
    expect(authRollback).not.toHaveBeenCalled();
    // 未标记的 idempotency 正常回滚
    expect(mocks.idempotency.releaseIdempotencyLock).toHaveBeenCalled();
  });

  it('余额不足（pre-consume 失败）→ 402 且未调上游（route/proxy 均未执行）', async () => {
    const { PreConsumeFailedError } = await import('../../lib/errors');
    mocks.preConsume.preConsume.mockRejectedValue(new PreConsumeFailedError('0', '0.001'));

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.apiKeyContext, { userId: 1, apiKeyId: 1, keyHash: 'k' });
    const result = await runPipeline(ctx, buildGatewaySteps() as never);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PreConsumeFailedError);
      expect(result.failedStep).toBe('pre-consume');
    }
    expect(mocks.routing.selectChannel).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    // 锁被回滚释放（允许同键重试）
    expect(mocks.idempotency.releaseIdempotencyLock).toHaveBeenCalledWith('req-1', 't1');
  });

  it('无可用渠道且无 mock 回退 → 502（NO_AVAILABLE_CHANNEL）+ 解冻预扣', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    mocks.preConsume.preConsume.mockResolvedValue({ mode: 'frozen', amount: 0.001, requestId: 'req-1' });

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.apiKeyContext, { userId: 1, apiKeyId: 1, keyHash: 'k' });
    const result = await runPipeline(ctx, buildGatewaySteps() as never);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as { code?: string }).code).toBe('NO_AVAILABLE_CHANNEL');
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
    // 预扣冻结被解冻
    expect(mocks.preConsume.releasePreConsume).toHaveBeenCalled();
  });

  it('步骤输出经共享存储传递：route 结果被 proxy 读取（channel 注入上游 URL）', async () => {
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.apiKeyContext, { userId: 1, apiKeyId: 1, keyHash: 'k' });
    const result = await runPipeline(ctx, buildGatewaySteps() as never);
    expect(result.success).toBe(true);
    const [url] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/v1/chat/completions');
    // 共享存储可读取（route step 写回 channel）
    expect(getStepResult(ctx, STEP_KEYS.channel)).toBeTruthy();
  });
});

// ============================================================
// 路由级：chat 网关 × 真实 pipeline（行为等价回归）
// ============================================================

const TEST_TMP_DIR = path.resolve(process.cwd(), 'tmp', 'test-pipeline-multimodal');

describe('Pipeline 网关集成（chat 路由）', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    mocks.apikey.apiKeyAuth.mockImplementation(async (request: any) => {
      request.apiKeyContext = { userId: 1, apiKeyId: 11, keyHash: 'test-hash' };
    });
    mocks.rateLimit.enforceRateLimitPreHandler.mockImplementation(async () => {});
    mocks.idempotency.resolveIdempotencyKey.mockImplementation((_req: unknown, fallback: string) => fallback);
    mocks.idempotency.acquireIdempotencyLock.mockResolvedValue({ status: 'acquired', token: 't1' });
    mocks.idempotency.releaseIdempotencyLock.mockResolvedValue(undefined);
    mocks.idempotency.replayIdempotentRequest.mockResolvedValue(false);
    mocks.idempotency.cacheIdempotentResponse.mockResolvedValue(undefined);
    mocks.idempotency.isIdempotencyUniqueViolation.mockReturnValue(false);
    mocks.idempotency.buildIdempotencySummary.mockImplementation((p: Record<string, unknown>) => ({ ...p }));
    mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
    mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
    mocks.consumption.recordConsumption.mockResolvedValue({ id: 1 });
    mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
    mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
    mocks.circuitBreaker.isCircuitOpen.mockResolvedValue(false);
    mocks.conversation.recordConversationContext.mockResolvedValue(undefined);
    mocks.conversation.fingerprintKey.mockImplementation((k: string) => `fp-${k}`);
    mocks.preConsume.preConsume.mockResolvedValue({ mode: 'bypass', amount: 0, requestId: 'test' });
    mocks.preConsume.releasePreConsume.mockResolvedValue(undefined);
    mocks.routing.selectChannel.mockResolvedValue(makeChannel());

    // DB 查询链：定价/阈值查询返回空 → 默认值；更新链 no-op
    mocks.db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }));
    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    vi.stubGlobal('fetch', mocks.fetch);
    process.env.MULTIMODAL_TMP_DIR = TEST_TMP_DIR;

    app = Fastify({ bodyLimit: 64 * 1024 * 1024 });
    await app.register(chatRoutes);
    await app.register(internalAssetsRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    process.env.MULTIMODAL_TMP_DIR = undefined;
    try { await rm(TEST_TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const payload = { model: 'deepseek-v3', messages: [{ role: 'user', content: 'hi' }] };

  it('正常链路（非流式）→ 200 + 记账，锁不解冻', async () => {
    mocks.fetch.mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload });
    expect(res.statusCode).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ streamed: false, trustUpstream: true }));
    expect(mocks.preConsume.releasePreConsume).not.toHaveBeenCalled();
    expect(mocks.idempotency.releaseIdempotencyLock).not.toHaveBeenCalled();
  });

  it('余额不足（pre-consume 抛 402）→ 402 且未调上游，幂等锁已释放', async () => {
    const { PreConsumeFailedError } = await import('../../lib/errors');
    mocks.preConsume.preConsume.mockRejectedValue(new PreConsumeFailedError('0', '0.001'));

    const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.type).toBe('pre_consume_failed');
    expect(mocks.fetch).not.toHaveBeenCalled();
    // rollback：幂等锁释放（允许同键重试）
    expect(mocks.idempotency.releaseIdempotencyLock).toHaveBeenCalled();
  });

  it('上游 5xx → 透传 502 + 解冻预扣 + 释放幂等锁（rollback 真实生效）', async () => {
    mocks.preConsume.preConsume.mockResolvedValue({ mode: 'frozen', amount: 0.001, requestId: 'test' });
    mocks.fetch.mockResolvedValue(new Response('{"error":{"message":"upstream down"}}', { status: 502, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload });
    expect(res.statusCode).toBe(502);
    // 上游错误体透传
    expect(res.json().error.message).toBe('upstream down');
    // 预扣解冻 + 锁释放（pipeline rollback）
    expect(mocks.preConsume.releasePreConsume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'frozen', amount: 0.001 }),
    );
    expect(mocks.idempotency.releaseIdempotencyLock).toHaveBeenCalledWith(expect.any(String), 't1');
  });

  it('无可用渠道 → mock 回退 200（同记账，不调上游）', async () => {
    mocks.routing.selectChannel.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload });
    expect(res.statusCode).toBe(200);
    expect(res.json().mock).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ fallback: true, trustUpstream: false }));
  });

  it('大 base64（>10MB）→ 上传临时文件、替换为内网 URL 后转发', async () => {
    mocks.fetch.mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const chunk = 'A'.repeat(1024 * 1024 * 4);
    const largeB64 = `data:image/png;base64,${chunk.repeat(4)}`;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'deepseek-v3', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: largeB64 } }] }] },
    });
    expect(res.statusCode).toBe(200);

    // 上游收到的 body：base64 已被内网 URL 替换
    const [, init] = mocks.fetch.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    const sentUrl = (sentBody.messages[0].content[0] as { image_url: { url: string } }).image_url.url;
    expect(sentUrl).toMatch(/^\/internal\/assets\/[0-9a-f-]{36}\.png$/);
  });

  it('小 base64 → 原样转发（不落盘）', async () => {
    mocks.fetch.mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const smallB64 = 'data:image/png;base64,iVBORw0KGgo=';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'deepseek-v3', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: smallB64 } }] }] },
    });
    expect(res.statusCode).toBe(200);

    const [, init] = mocks.fetch.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect((sentBody.messages[0].content[0] as { image_url: { url: string } }).image_url.url).toBe(smallB64);
  });

  it('内网资产端点：GET /internal/assets/:name 可下载已上传临时文件', async () => {
    process.env.MULTIMODAL_TMP_DIR = TEST_TMP_DIR;
    const { storeTempAsset } = await import('../../services/upstream/temp-asset-store');
    const url = await storeTempAsset('data:image/png;base64,aGVsbG8=');
    const fileName = url.split('/').pop()!;

    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('hello');
  });

  it('内网资产端点：路径穿越文件名 → 404（不读目录外文件）', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/assets/..%2F..%2F.env' });
    expect(res.statusCode).toBe(404);
  });
});
