/**
 * settleBilling 缓存字段透传单元测试（T5，D-4/D-8）
 *
 * 验证 SettleOptions 新字段（cacheWriteTokens/cacheHitCost/cacheWriteCost/
 * cacheReadInputPrice/cacheWriteInputPrice/cacheWritePriceSource）透传到 recordConsumption。
 * recordConsumption 已 mock（其自身写路径由 consumption-log-cache.test.ts 覆盖）。
 *
 * 纯单测（mock db / balance / consumption-log / commission / pre-consume，不依赖真实 PG/Redis）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  db: { insert: vi.fn(), update: vi.fn() },
  balance: { deductBalance: vi.fn() },
  consumption: { recordConsumption: vi.fn() },
  commission: { generateCommissionForConsumption: vi.fn() },
  preConsume: { settlePreConsume: vi.fn(), recordNegativeBalanceRisk: vi.fn() },
}));

vi.mock('../src/db', () => ({
  db: mocks.db,
  schema: {
    apiKeys: { id: {}, lastUsedAt: {} },
  },
}));
vi.mock('../src/services/billing/balance', () => ({
  deductBalance: mocks.balance.deductBalance,
  addBalance: vi.fn(),
  getBalance: vi.fn(),
  initBalance: vi.fn(),
}));
vi.mock('../src/services/billing/consumption-log', () => ({
  recordConsumption: mocks.consumption.recordConsumption,
  getUserConsumptionStats: vi.fn(),
}));
vi.mock('../src/services/agent/commission', () => ({
  generateCommissionForConsumption: mocks.commission.generateCommissionForConsumption,
}));
vi.mock('../src/services/billing/pre-consume', () => ({
  settlePreConsume: mocks.preConsume.settlePreConsume,
  recordNegativeBalanceRisk: mocks.preConsume.recordNegativeBalanceRisk,
}));

import { settleBilling } from '../src/services/billing/settle';

describe('settleBilling — SettleOptions 缓存字段透传（T5）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.balance.deductBalance.mockResolvedValue({ balanceAfter: '99.999', version: 2 });
    mocks.consumption.recordConsumption.mockResolvedValue({ id: 7 });
    mocks.commission.generateCommissionForConsumption.mockResolvedValue(null);
    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
  });

  const ctx = { userId: 1, apiKeyId: 11, model: 'deepseek-chat', requestId: 'req-cache-1' } as never;

  it('旁路扣费路径：全部缓存字段透传到 recordConsumption', async () => {
    await settleBilling(
      ctx as any,
      1500,
      100,
      1.2,
      null,
      {
        streamed: false,
        trustUpstream: true,
        fallback: false,
        cacheHitTokens: 1000,
        cacheDiscount: 0.5,
        cacheWriteTokens: 0,
        cacheHitCost: 0.5,
        cacheWriteCost: 0,
        cacheReadInputPrice: 0.05,
        cacheWriteInputPrice: 1,
        cacheWritePriceSource: 'explicit',
        preConsume: null,
      },
    );

    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      inputTokens: 1500,
      outputTokens: 100,
      cost: '1.20000000', // toFixed(8) 口径
      cacheHitTokens: 1000,
      cacheDiscount: 0.5,
      cacheWriteTokens: 0,
      cacheHitCost: 0.5,
      cacheWriteCost: 0,
      cacheReadInputPrice: 0.05,
      cacheWriteInputPrice: 1,
      cacheWritePriceSource: 'explicit',
    }));
  });

  it('冻结预扣路径（mode=frozen）：走 settlePreConsume 且缓存字段同样透传', async () => {
    await settleBilling(
      ctx as any,
      1000,
      0,
      0.8,
      null,
      {
        streamed: true,
        trustUpstream: true,
        fallback: false,
        cacheHitTokens: 800,
        cacheDiscount: 0.2,
        cacheWriteTokens: 100,
        cacheHitCost: 0.4,
        cacheWriteCost: 0.1,
        cacheReadInputPrice: 0.05,
        cacheWriteInputPrice: 1,
        cacheWritePriceSource: 'full_price',
        preConsume: { mode: 'frozen', requestId: 'f-1', amount: 100, frozenAt: new Date() } as any,
      },
    );

    expect(mocks.preConsume.settlePreConsume).toHaveBeenCalled();
    expect(mocks.balance.deductBalance).not.toHaveBeenCalled();
    expect(mocks.consumption.recordConsumption).toHaveBeenCalledWith(expect.objectContaining({
      cacheWriteTokens: 100,
      cacheWritePriceSource: 'full_price',
    }));
  });
});
