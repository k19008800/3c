/**
 * MJ / Suno 任务后台轮询器单元测试 — pollTaskUpdates
 *
 * 纯单测风格：对 task-store / balance / circuit-breaker / fetch 做 vi.mock 注入，
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖：
 * - MJ 按 supplier 分组批量轮询：POST {baseUrl}/mj/task/list-by-condition（mj-api-secret 头），
 *   成功 → updateTaskStatus(success, 响应)；失败 → failTaskWithRefund + addBalance 退款
 * - Suno 按 upstreamId 匹配：POST {baseUrl}/suno/fetch（Bearer 头）
 * - 渠道不可用 → 组内任务全部失败 + 退款
 * - 超 1 小时未刷新 → 判失败（timeout）+ 退款
 * - 防重复退款：failTaskWithRefund 返回 null → 不再 addBalance
 * - 上游错误 → 记录熔断、任务留待下个 tick（不误杀）
 * - mapUpstreamStatus 状态映射纯函数
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollTaskUpdates, mapUpstreamStatus } from '../src/services/task/task-poller';

// ============================================================
// Module mocks
// ============================================================

const mocks = vi.hoisted(() => ({
  taskStore: {
    listInProgressTasks: vi.fn(),
    getSupplierWithKey: vi.fn(),
    updateTaskStatus: vi.fn(),
    failTaskWithRefund: vi.fn(),
  },
  balance: { addBalance: vi.fn() },
  circuitBreaker: { recordChannelResult: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock('../src/services/task/task-store', () => ({
  listInProgressTasks: mocks.taskStore.listInProgressTasks,
  getSupplierWithKey: mocks.taskStore.getSupplierWithKey,
  updateTaskStatus: mocks.taskStore.updateTaskStatus,
  failTaskWithRefund: mocks.taskStore.failTaskWithRefund,
}));
vi.mock('../src/services/billing/balance', () => ({
  addBalance: mocks.balance.addBalance,
}));
vi.mock('../src/services/upstream/circuit-breaker', () => ({
  recordChannelResult: mocks.circuitBreaker.recordChannelResult,
}));

// ============================================================
// Test helpers
// ============================================================

/** 构造进行中任务记录（字段对齐 task-store 的 TaskRecord） */
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    taskType: 'midjourney',
    publicId: 'mj-1',
    upstreamId: 'mj-1',
    userId: 1,
    apiKeyId: 11,
    supplierId: 1,
    channelKeyId: 7,
    action: 'imagine',
    model: 'mj_imagine',
    prompt: null,
    status: 'processing',
    progress: '50%',
    failReason: null,
    response: null,
    cost: '0.008',
    refunded: false,
    requestId: 'req-1',
    submitTime: new Date(Date.now() - 60_000), // 1 分钟前
    startTime: null,
    finishTime: null,
    createdAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

function makeSupplier() {
  return {
    supplier: { id: 1, name: 'MJ Sup', code: 'mj', baseUrl: 'https://mj.test', apiType: 'midjourney', status: 'active' },
    key: { id: 7, supplierId: 1, keyValue: 'sk-mj', name: 'k7', status: 'active' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.taskStore.updateTaskStatus.mockResolvedValue({ id: 1 });
  mocks.taskStore.failTaskWithRefund.mockImplementation(async () => null);
  mocks.balance.addBalance.mockResolvedValue({ balanceAfter: '100' });
  mocks.circuitBreaker.recordChannelResult.mockResolvedValue({ shouldBan: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// mapUpstreamStatus — 状态映射纯函数
// ============================================================

describe('mapUpstreamStatus（上游状态 → 内部状态）', () => {
  it('MJ 大写状态映射', () => {
    expect(mapUpstreamStatus('NOT_START')).toBe('submitted');
    expect(mapUpstreamStatus('IN_PROGRESS')).toBe('processing');
    expect(mapUpstreamStatus('SUCCESS')).toBe('success');
    expect(mapUpstreamStatus('FAILURE')).toBe('failed');
  });

  it('Suno 小写状态映射（大小写归一）', () => {
    expect(mapUpstreamStatus('submitted')).toBe('submitted');
    expect(mapUpstreamStatus('queueing')).toBe('processing');
    expect(mapUpstreamStatus('processing')).toBe('processing');
    expect(mapUpstreamStatus('success')).toBe('success');
    expect(mapUpstreamStatus('failed')).toBe('failed');
  });

  it('未知状态 → null（不动该任务）', () => {
    expect(mapUpstreamStatus('weird')).toBeNull();
    expect(mapUpstreamStatus('')).toBeNull();
  });
});

// ============================================================
// pollTaskUpdates — MJ 轮询
// ============================================================

describe('pollTaskUpdates — MJ 批量轮询', () => {
  it('按 supplier 分组 → 批量请求 /mj/task/list-by-condition（mj-api-secret 头）→ 成功合并 / 失败退款', async () => {
    const t1 = makeTask({ id: 1, publicId: 'mj-1' });
    const t2 = makeTask({ id: 2, publicId: 'mj-2', cost: '0.016', requestId: 'req-2' });
    mocks.taskStore.listInProgressTasks.mockResolvedValue([t1, t2]);
    mocks.taskStore.getSupplierWithKey.mockResolvedValue(makeSupplier());

    // 上游返回两个 dto：t1 成功、t2 失败
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify([
      { id: 'mj-1', status: 'SUCCESS', progress: '100%', startTime: '2026-08-16T12:00:30Z', finishTime: '2026-08-16T12:01:00Z', imageUrl: 'https://x/img1.png' },
      { id: 'mj-2', status: 'FAILURE', progress: '0%', failReason: 'banned words' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    // 失败任务退款：failTaskWithRefund 返回该任务
    mocks.taskStore.failTaskWithRefund.mockImplementation(async (id: number) => (id === 2 ? t2 : null));

    const summary = await pollTaskUpdates();

    // 请求形态
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://mj.test/mj/task/list-by-condition');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['mj-api-secret']).toBe('sk-mj');
    expect(headers['Authorization']).toBe('Bearer sk-mj');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ['mj-1', 'mj-2'] });

    // 成功任务：status success + 完整响应 + finishTime
    expect(mocks.taskStore.updateTaskStatus).toHaveBeenCalledWith(1, expect.objectContaining({
      status: 'success',
      progress: '100%',
      finishTime: new Date('2026-08-16T12:01:00Z'),
    }));
    const call1 = mocks.taskStore.updateTaskStatus.mock.calls[0]![1] as { response: { imageUrl: string } };
    expect(call1.response.imageUrl).toBe('https://x/img1.png');

    // 失败任务：failTaskWithRefund + 退款（addBalance refund → 佣金冲销钩子）
    expect(mocks.taskStore.failTaskWithRefund).toHaveBeenCalledWith(2, 'banned words');
    expect(mocks.balance.addBalance).toHaveBeenCalledWith(1, '0.016', 'refund', 'consumption', 'req-2');

    expect(summary).toEqual({ checked: 2, updated: 1, failed: 1, refunded: 1, skipped: 0 });
  });

  it('渠道不可用（getSupplierWithKey null）→ 组内任务全部失败 + 退款', async () => {
    const t1 = makeTask({ id: 1 });
    const t2 = makeTask({ id: 2 });
    mocks.taskStore.listInProgressTasks.mockResolvedValue([t1, t2]);
    mocks.taskStore.getSupplierWithKey.mockResolvedValue(null);
    mocks.taskStore.failTaskWithRefund.mockImplementation(async (id: number) => (id === 1 ? t1 : t2));

    const summary = await pollTaskUpdates();

    expect(mocks.taskStore.failTaskWithRefund).toHaveBeenCalledWith(1, 'channel_unavailable');
    expect(mocks.taskStore.failTaskWithRefund).toHaveBeenCalledWith(2, 'channel_unavailable');
    expect(mocks.balance.addBalance).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(summary.failed).toBe(2);
    expect(summary.refunded).toBe(2);
  });
});

// ============================================================
// pollTaskUpdates — Suno 轮询
// ============================================================

describe('pollTaskUpdates — Suno 批量轮询', () => {
  it('按 upstreamId 匹配（task_id = 上游内部 id），Bearer 头，成功/失败合并', async () => {
    const t1 = makeTask({ id: 1, taskType: 'suno', publicId: 'task_a', upstreamId: 'up-1' });
    const t2 = makeTask({ id: 2, taskType: 'suno', publicId: 'task_b', upstreamId: 'up-2', cost: '0.01', requestId: 'req-2' });
    mocks.taskStore.listInProgressTasks.mockResolvedValue([t1, t2]);
    mocks.taskStore.getSupplierWithKey.mockResolvedValue({
      supplier: { id: 1, name: 'Suno Sup', code: 'suno', baseUrl: 'https://suno.test', apiType: 'suno', status: 'active' },
      key: { id: 7, supplierId: 1, keyValue: 'sk-suno', name: 'k7', status: 'active' },
    });

    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      code: 'success',
      data: [
        { task_id: 'up-1', status: 'success', submit_time: '2026-08-16T12:00:00Z', finish_time: '2026-08-16T12:01:00Z', data: { audio_url: 'https://x/a.mp3' } },
        { task_id: 'up-2', status: 'failed', fail_reason: 'model error' },
      ],
    }), { status: 200 }));

    mocks.taskStore.failTaskWithRefund.mockImplementation(async (id: number) => (id === 2 ? t2 : null));

    const summary = await pollTaskUpdates();

    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://suno.test/suno/fetch');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['mj-api-secret']).toBeUndefined();
    expect(headers['Authorization']).toBe('Bearer sk-suno');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ['up-1', 'up-2'] });

    // 成功按 upstreamId 匹配到 task id=1
    expect(mocks.taskStore.updateTaskStatus).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'success' }));
    expect(mocks.taskStore.failTaskWithRefund).toHaveBeenCalledWith(2, 'model error');
    expect(mocks.balance.addBalance).toHaveBeenCalledWith(1, '0.01', 'refund', 'consumption', 'req-2');
    expect(summary).toEqual({ checked: 2, updated: 1, failed: 1, refunded: 1, skipped: 0 });
  });
});

// ============================================================
// pollTaskUpdates — 超时 / 防重 / 上游错误
// ============================================================

describe('pollTaskUpdates — 超时、防重复退款、上游错误', () => {
  it('超 1 小时仍未刷新 → 判失败（timeout）+ 退款', async () => {
    const oldTask = makeTask({ id: 9, submitTime: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    mocks.taskStore.listInProgressTasks.mockResolvedValue([oldTask]);
    mocks.taskStore.getSupplierWithKey.mockResolvedValue(makeSupplier());
    // 上游返回空结果（本轮未刷新到该任务）
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    mocks.taskStore.failTaskWithRefund.mockImplementation(async () => oldTask);

    const summary = await pollTaskUpdates();

    expect(mocks.taskStore.failTaskWithRefund).toHaveBeenCalledWith(9, 'timeout');
    expect(mocks.balance.addBalance).toHaveBeenCalledWith(1, '0.008', 'refund', 'consumption', 'req-1');
    expect(summary.failed).toBe(1);
    expect(summary.refunded).toBe(1);
  });

  it('防重复退款：failTaskWithRefund 返回 null（已 refunded）→ 不再 addBalance', async () => {
    mocks.taskStore.listInProgressTasks.mockResolvedValue([makeTask({ id: 9, submitTime: new Date(Date.now() - 2 * 60 * 60 * 1000) })]);
    mocks.taskStore.getSupplierWithKey.mockResolvedValue(makeSupplier());
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    mocks.taskStore.failTaskWithRefund.mockResolvedValue(null); // 已被并发/前序处理

    const summary = await pollTaskUpdates();

    expect(mocks.taskStore.failTaskWithRefund).toHaveBeenCalledWith(9, 'timeout');
    expect(mocks.balance.addBalance).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
    expect(summary.refunded).toBe(0);
  });

  it('上游请求失败（网络错误）→ 记录熔断失败，任务留待下个 tick（不误杀不退款）', async () => {
    const freshTask = makeTask({ id: 1, submitTime: new Date(Date.now() - 30_000) });
    mocks.taskStore.listInProgressTasks.mockResolvedValue([freshTask]);
    mocks.taskStore.getSupplierWithKey.mockResolvedValue(makeSupplier());
    mocks.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const summary = await pollTaskUpdates();

    expect(mocks.circuitBreaker.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:7', false);
    expect(mocks.taskStore.updateTaskStatus).not.toHaveBeenCalled();
    expect(mocks.taskStore.failTaskWithRefund).not.toHaveBeenCalled(); // 未超时 + 未刷新 → 不动
    expect(mocks.balance.addBalance).not.toHaveBeenCalled();
    expect(summary).toEqual({ checked: 0, updated: 0, failed: 0, refunded: 0, skipped: 0 });
  });

  it('无进行中任务 → 直接返回空统计，不请求上游', async () => {
    mocks.taskStore.listInProgressTasks.mockResolvedValue([]);
    const summary = await pollTaskUpdates();
    expect(summary).toEqual({ checked: 0, updated: 0, failed: 0, refunded: 0, skipped: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
