/**
 * recordConsumption 缓存审计/快照列落库单元测试（T5，D-4/D-8）
 *
 * 验证 consumption_records 5 新列写入 + 写入价来源标识（D-4）合并进 metadata。
 * 真实 recordConsumption 实现（仅 mock db），验证写路径正确性。
 *
 * 纯单测（mock ../src/db，不依赖真实 PG）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../src/db', () => ({
  db: mocks.db,
  schema: {
    consumptionRecords: {
      userId: {}, apiKeyId: {}, requestId: {}, model: {}, supplierId: {}, supplierModelId: {},
      inputTokens: {}, outputTokens: {}, totalTokens: {}, cost: {}, trustUpstream: {}, fallback: {},
      streamed: {}, finishReason: {}, errorCode: {}, metadata: {}, createdAt: {},
      cacheHitTokens: {}, cacheDiscount: {},
      cacheWriteTokens: {}, cacheHitCost: {}, cacheWriteCost: {}, cacheReadInputPrice: {}, cacheWriteInputPrice: {},
    },
  },
}));

import { recordConsumption } from '../src/services/billing/consumption-log';

describe('recordConsumption — P0 缓存审计/快照列落库（D-8）', () => {
  let capturedValues: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedValues = null;
    mocks.db.insert.mockReturnValue({
      values: vi.fn((v: Record<string, unknown>) => {
        capturedValues = v;
        return { returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
      }),
    });
  });

  it('写入 5 新列 + 既有缓存列（numeric 转字符串、null 保留）', async () => {
    await recordConsumption({
      userId: 1,
      apiKeyId: 2,
      model: 'deepseek-chat',
      inputTokens: 1500,
      outputTokens: 100,
      cost: '1.20000000',
      trustUpstream: true,
      fallback: false,
      streamed: false,
      cacheHitTokens: 1000,
      cacheDiscount: 0.5,
      cacheWriteTokens: 0,
      cacheHitCost: 0.5,
      cacheWriteCost: 0,
      cacheReadInputPrice: 0.05,
      cacheWriteInputPrice: 1,
      cacheWritePriceSource: 'explicit',
    });

    expect(capturedValues).toMatchObject({
      cacheHitTokens: 1000,
      cacheDiscount: '0.5',          // numeric(18,8) 字符串口径
      cacheWriteTokens: 0,
      cacheHitCost: '0.5',
      cacheWriteCost: '0',
      cacheReadInputPrice: '0.05',
      cacheWriteInputPrice: '1',
      // D-4：写入价来源标识合并进 metadata
      metadata: { cache_write_price_source: 'explicit' },
    });
  });

  it('无缓存信息（字段缺省）→ 新列写 null、metadata 无来源标识', async () => {
    await recordConsumption({
      userId: 1,
      apiKeyId: 2,
      model: 'm',
      inputTokens: 100,
      outputTokens: 0,
      cost: '0.00020000',
      trustUpstream: true,
      fallback: false,
      streamed: false,
    });

    expect(capturedValues).toMatchObject({
      cacheHitTokens: 0,
      cacheDiscount: null,
      cacheWriteTokens: null,
      cacheHitCost: null,
      cacheWriteCost: null,
      cacheReadInputPrice: null,
      cacheWriteInputPrice: null,
      metadata: null,
    });
  });

  it('写入价来源标识 full_price（discount_rate 模式/写入价缺失）→ metadata 记录', async () => {
    await recordConsumption({
      userId: 1,
      apiKeyId: 2,
      model: 'm',
      inputTokens: 100,
      outputTokens: 0,
      cost: '0.00020000',
      trustUpstream: true,
      fallback: false,
      streamed: false,
      cacheHitCost: 0,
      cacheWriteCost: 0,
      cacheWritePriceSource: 'full_price',
    });

    expect(capturedValues).toMatchObject({
      metadata: { cache_write_price_source: 'full_price' },
    });
  });
});
