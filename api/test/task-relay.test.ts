/**
 * Midjourney / Suno 任务型渠道适配端点单元测试 — /v1/mj/* 与 /v1/suno/*
 *
 * 纯单测风格（对齐 responses.test.ts / rerank.test.ts）：
 * 对 db / fetch / selectTaskChannel / task-store / apiKeyAuth 等模块做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - POST /v1/mj/submit/imagine：fetch 转发到 {baseUrl}/mj/submit/imagine
 *   （含 mj-api-secret 头）→ 落库（publicId = 上游 result）→ 记账模型 mj_imagine + 任务单价
 * - MJ 响应码改写：code 21/22 → 1
 * - 上游未返回任务 id → 不落库不记账，透传
 * - POST /v1/suno/submit/MUSIC：公开 id task_<32hex> 返回给客户端、上游 id 落库 upstream_id
 * - 任务依赖动作渠道锁定：body.taskId 定位原任务 → 原渠道转发；未找到 → {code:4, task_no_found}
 * - 记账失败 → 删除任务记录补偿
 * - fetch 本地 DB 服务：MJ/Suno 单查 + Suno 批量，用户隔离
 * - mock 回退不落库；余额 0 → 402；缺 action → 400
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
  taskStore: {
    createTaskRecord: vi.fn(),
    deleteTaskRecord: vi.fn(),
    getTaskForUser: vi.fn(),
    listTasksForUser: vi.fn(),
    getSupplierWithKey: vi.fn(),
  },
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
vi.mock('../src/services/task/task-store', () => ({
  createTaskRecord: mocks.taskStore.createTaskRecord,
  deleteTaskRecord: mocks.taskStore.deleteTaskRecord,
  getTaskForUser: mocks.taskStore.getTaskForUser,
  listTasksForUser: mocks.taskStore.listTasksForUser,
  getSupplierWithKey: mocks.taskStore.getSupplierWithKey,
}));
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

/** 构造 task-store 返回的任务记录（channel-lock / fetch 用） */
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    taskType: 'midjourney',
    publicId: 'task-abc-123',
    upstreamId: 'task-abc-123',
    userId: 1,
    apiKeyId: 11,
    supplierId: 1,
    channelKeyId: 7,
    action: 'imagine',
    model: 'mj_imagine',
    prompt: null,
    status: 'submitted',
    progress: null,
    failReason: null,
    response: null,
    cost: '0.008',
    refunded: false,
    requestId: 'req-1',
    submitTime: new Date('2026-08-16T12:00:00Z'),
    startTime: null,
    finishTime: null,
    createdAt: new Date('2026-08-16T12:00:00Z'),
    updatedAt: new Date('2026-08-16T12:00:00Z'),
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

  // 默认余额充足 + 记账成功 + 定价走默认价 + 落库成功
  mocks.balance.getBalance.mockResolvedValue({ totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY' });
  mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
  mocks.consumption.recordConsumption.mockResolvedValue({ id: 1 });
  mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
  mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
  mocks.taskStore.createTaskRecord.mockResolvedValue(makeTask());
  mocks.taskStore.deleteTaskRecord.mockResolvedValue(undefined);
  mocks.taskStore.getTaskForUser.mockResolvedValue(null);
  mocks.taskStore.listTasksForUser.mockResolvedValue([]);
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
  it('正常路径：转发 + 落库（publicId=上游 result）+ 记账模型 mj_imagine + 任务单价', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    const upstreamPayload = { code: 1, result: 'task-abc-123', description: 'submitted', properties: { finalPrompt: 'a cat' } };
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(upstreamPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/imagine',
      payload: { prompt: 'a cat --ar 16:9' },
    });

    expect(res.statusCode).toBe(200);
    // fetch 转发 + MJ 头
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://upstream.test/mj/submit/imagine');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-upstream');
    expect(headers['mj-api-secret']).toBe('sk-upstream');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: 'a cat --ar 16:9' });
    // 上游响应体透传
    expect(res.json().result).toBe('task-abc-123');

    // 落库：publicId = 上游 result；渠道锁定字段
    expect(mocks.taskStore.createTaskRecord).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'midjourney',
      publicId: 'task-abc-123',
      upstreamId: 'task-abc-123',
      userId: 1,
      apiKeyId: 11,
      supplierId: 1,
      channelKeyId: 7,
      model: 'mj_imagine',
      cost: expect.any(String),
    }));

    // 记账：模型 mj_imagine、1 任务 = 1000 output tokens、trustUpstream=true
    expect(mocks.balance.deductBalance).toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mj_imagine',
      inputTokens: 0,
      outputTokens: 1000,
      streamed: false,
      trustUpstream: true,
      fallback: false,
    }));
  });

  it('MJ 响应码改写：上游 code 21/22 → 1（任务已存在/排队视为已提交）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 21, result: 'dup-1', description: 'task exists' }), { status: 200 }));

    const res = await app.inject({ method: 'POST', url: '/v1/mj/submit/imagine', payload: { prompt: 'x' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe(1);
    // 仍按正常提交落库
    expect(mocks.taskStore.createTaskRecord).toHaveBeenCalledWith(expect.objectContaining({ publicId: 'dup-1' }));
  });

  it('上游未返回任务 id（业务错误码）→ 不落库不记账，透传响应', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 24, result: null, description: 'banned words' }), { status: 200 }));

    const res = await app.inject({ method: 'POST', url: '/v1/mj/submit/imagine', payload: { prompt: 'bad' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe(24);
    expect(mocks.taskStore.createTaskRecord).not.toHaveBeenCalled();
    expect(mocks.balance.deductBalance).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
  });

  it('余额 0 → 402，不发起上游调用、不落库', async () => {
    mocks.balance.getBalance.mockResolvedValue({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', currency: 'CNY' });
    const res = await app.inject({ method: 'POST', url: '/v1/mj/submit/imagine', payload: { prompt: 'a cat' } });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.type).toBe('insufficient_balance');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.taskStore.createTaskRecord).not.toHaveBeenCalled();
  });

  it('无可用 channel → mock 回退（占位任务 id + 记账 fallback=true，不落库）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/v1/mj/submit/imagine', payload: { prompt: 'a cat' } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.code).toBe(1);
    expect(body.result).toMatch(/^mock-task-/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.taskStore.createTaskRecord).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mj_imagine',
      outputTokens: 1000,
      trustUpstream: false,
      fallback: true,
    }));
  });

  it('记账失败 → 删除刚落库的任务记录补偿（不留孤儿任务）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 1, result: 'task-x' }), { status: 200 }));
    mocks.taskStore.createTaskRecord.mockResolvedValue(makeTask({ id: 42, publicId: 'task-x' }));
    mocks.consumption.recordConsumption.mockRejectedValue(new Error('db down'));

    const res = await app.inject({ method: 'POST', url: '/v1/mj/submit/imagine', payload: { prompt: 'x' } });

    expect(res.statusCode).toBe(500);
    expect(mocks.taskStore.deleteTaskRecord).toHaveBeenCalledWith(42);
  });

  it('缺 action 路径参数（空串）→ 400 INVALID_REQUEST', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/mj/submit/', payload: { prompt: 'a cat' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('"action" is required in the path');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

// ============================================================
// 任务依赖动作 → 渠道锁定
// ============================================================

describe('任务依赖动作渠道锁定（change/simple-change 等）', () => {
  it('body.taskId 定位原任务 → 用原渠道转发（supplier=2/key=9）', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(makeTask({
      id: 5,
      supplierId: 2,
      channelKeyId: 9,
      model: 'mj_imagine',
    }));
    mocks.taskStore.getSupplierWithKey.mockResolvedValue({
      supplier: { id: 2, name: 'Origin Sup', code: 'origin', baseUrl: 'https://origin.test', apiType: 'midjourney', status: 'active' },
      key: { id: 9, supplierId: 2, keyValue: 'sk-origin', name: 'k9', status: 'active' },
    });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 1, result: 'task-abc' }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/change',
      payload: { taskId: 'task-abc', index: 2 },
    });

    expect(res.statusCode).toBe(200);
    // 不重新选渠道，直接转发到原渠道
    expect(mocks.routing.selectTaskChannel).not.toHaveBeenCalled();
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://origin.test/mj/submit/change');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-origin');
    expect(headers['mj-api-secret']).toBe('sk-origin');
    // 落库用原渠道 id
    expect(mocks.taskStore.createTaskRecord).toHaveBeenCalledWith(expect.objectContaining({
      supplierId: 2,
      channelKeyId: 9,
      publicId: 'task-abc',
    }));
  });

  it('simple-change content 尾 token 定位任务（"U2 1234567890"）', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(makeTask({ id: 6, supplierId: 1, channelKeyId: 7 }));
    mocks.taskStore.getSupplierWithKey.mockResolvedValue({
      supplier: { id: 1, name: 'S', code: 's', baseUrl: 'https://upstream.test', apiType: 'midjourney', status: 'active' },
      key: { id: 7, supplierId: 1, keyValue: 'sk', name: 'k', status: 'active' },
    });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 1, result: 't' }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/simple-change',
      payload: { content: 'U2 1234567890' },
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.taskStore.getTaskForUser).toHaveBeenCalledWith('midjourney', '1234567890', 1);
    // simple-change 计费模型 mj_reroll
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ model: 'mj_reroll' }));
  });

  it('原任务不存在/非本人 → 200 + {code:4, task_no_found}（MJ 语义），不转发不记账', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/change',
      payload: { taskId: 'ghost-task' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ code: 4, description: 'task_no_found' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.balance.deductBalance).not.toHaveBeenCalled();
    expect(mocks.taskStore.createTaskRecord).not.toHaveBeenCalled();
  });

  it('原渠道不可用 → 502 channel_unavailable', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(makeTask({ supplierId: 2, channelKeyId: 9 }));
    mocks.taskStore.getSupplierWithKey.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mj/submit/change',
      payload: { taskId: 'task-abc' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.type).toBe('channel_unavailable');
  });
});

// ============================================================
// POST /v1/suno/submit/:action
// ============================================================

describe('POST /v1/suno/submit/:action', () => {
  it('MUSIC 动作：公开 id task_<32hex> 返回客户端，上游 id 落库 upstream_id，无 mj-api-secret 头', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(makeChannel({ modelMapping: { id: 4, supplierId: 1, modelName: 'suno_music', platformModel: 'suno_music', status: 'active' } }));
    const upstreamPayload = { code: 'success', message: '', data: 'upstream-suno-1' };
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

    // 返回给客户端的是网关公开 id
    const body = res.json();
    expect(body.data).toMatch(/^task_[0-9a-f]{32}$/);

    // 落库：publicId = 公开 id，upstreamId = 上游 data
    expect(mocks.taskStore.createTaskRecord).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'suno',
      publicId: body.data,
      upstreamId: 'upstream-suno-1',
      model: 'suno_music',
    }));
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

    const res = await app.inject({ method: 'POST', url: '/v1/suno/submit/lyrics', payload: { prompt: 'write lyrics' } });
    expect(res.statusCode).toBe(200);
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({ model: 'suno_lyrics' }));
  });

  it('无可用 channel → mock 回退（Suno 占位 data + 记账 fallback=true，不落库）', async () => {
    mocks.routing.selectTaskChannel.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/v1/suno/submit/MUSIC', payload: { prompt: 'x' } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock).toBe(true);
    expect(body.code).toBe('success');
    expect(body.data).toMatch(/^mock-task-/);
    expect(mocks.taskStore.createTaskRecord).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      model: 'suno_music',
      fallback: true,
    }));
  });
});

// ============================================================
// 任务轮询 fetch（本地 DB 服务，不记账不转发上游）
// ============================================================

describe('任务轮询 fetch（本地 DB 服务）', () => {
  it('GET /v1/mj/task/:id/fetch → 本地任务记录（含轮询响应 imageUrl），不转发上游、不记账', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(makeTask({
      status: 'success',
      progress: '100%',
      response: { imageUrl: 'https://example.com/img.png', buttons: ['U1', 'U2'] },
      finishTime: new Date('2026-08-16T12:01:00Z'),
    }));

    const res = await app.inject({ method: 'GET', url: '/v1/mj/task/task-abc-123/fetch' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('task-abc-123');
    expect(body.status).toBe('SUCCESS'); // 内部状态 → MJ 大写语义
    expect(body.progress).toBe('100%');
    expect(body.imageUrl).toBe('https://example.com/img.png');
    expect(body.buttons).toEqual(['U1', 'U2']);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
    expect(mocks.taskStore.getTaskForUser).toHaveBeenCalledWith('midjourney', 'task-abc-123', 1);
  });

  it('GET /v1/mj/task/:id/fetch 未找到 → 200 + {code:4, task_no_found}', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/v1/mj/task/ghost/fetch' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ code: 4, description: 'task_no_found' });
  });

  it('GET /v1/suno/fetch/:id → 本地任务记录；未找到 → data:null', async () => {
    mocks.taskStore.getTaskForUser.mockResolvedValue(makeTask({
      taskType: 'suno',
      publicId: 'task_aaaa',
      upstreamId: 'u1',
      status: 'processing',
      response: { data: { audio_url: 'https://example.com/a.mp3' } },
    }));

    const res = await app.inject({ method: 'GET', url: '/v1/suno/fetch/task_aaaa' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe('success');
    expect(body.data.task_id).toBe('task_aaaa');
    expect(body.data.status).toBe('processing');
    expect(body.data.data.audio_url).toBe('https://example.com/a.mp3');

    // 未找到 → data:null
    mocks.taskStore.getTaskForUser.mockResolvedValue(null);
    const res2 = await app.inject({ method: 'GET', url: '/v1/suno/fetch/ghost' });
    expect(res2.json().data).toBeNull();
  });

  it('POST /v1/suno/fetch → 批量从本地 DB 服务（按 ids 查，用户隔离）', async () => {
    mocks.taskStore.listTasksForUser.mockResolvedValue([
      makeTask({ taskType: 'suno', publicId: 'task_aaaa', upstreamId: 'u1', status: 'success' }),
      makeTask({ id: 2, taskType: 'suno', publicId: 'task_bbbb', upstreamId: 'u2', status: 'failed', failReason: 'banned' }),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/suno/fetch',
      payload: { ids: ['task_aaaa', 'task_bbbb'] },
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.taskStore.listTasksForUser).toHaveBeenCalledWith('suno', ['task_aaaa', 'task_bbbb'], 1);
    const body = res.json();
    expect(body.code).toBe('success');
    expect(body.data).toHaveLength(2);
    expect(body.data[1].fail_reason).toBe('banned');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).not.toHaveBeenCalled();
  });
});
