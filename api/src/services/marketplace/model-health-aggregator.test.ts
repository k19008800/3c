/**
 * 模型健康聚合 Worker — 上游延迟接入口径测试（P3-2 Part B）
 *
 * 确认口径（docs/iteration-plan-v2.md P3-2）：
 *   聚合 Worker 从 conversation_context_records 的 occurred_at / completed_at
 *   计算延迟（completed_at - occurred_at，ms），按 lib/latency.ts 的桶边界
 *   （0/50/100/200/300/500/750/1000/1500/2000/3000/5000）折叠进
 *   model_health_stats.latency_hist，健康查询再据此算 p50/p99。
 *
 * 本测试用 mock db 断言：
 *   1. 聚合 SQL 确实以 completed_at - occurred_at 作为延迟表达式，且桶边界与
 *      LATENCY_BOUNDARIES 一致（口径单一来源不漂移）
 *   2. 不同延迟桶的计数正确折叠进 latencyHist，且成功/失败计数口径正确
 *
 * 端到端（真实 PG 写入 + p50/p99 断言）已由 test/admin-marketplace.test.ts 覆盖。
 *
 * @see docs/iteration-plan-v2.md P3-2
 * @module services/marketplace/model-health-aggregator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LATENCY_BOUNDARIES } from '../../lib/latency';

const mocks = vi.hoisted(() => ({
  db: { execute: vi.fn(), insert: vi.fn() },
  schema: {
    modelHealthStats: {
      bucketStart: {},
      platformModel: {},
      supplierId: {},
      supplierModelId: {},
      requestCount: {},
      successCount: {},
      errorCount: {},
      errorCodeDist: {},
      latencyHist: {},
      updatedAt: {},
    },
  },
}));

vi.mock('../../db', () => ({
  db: mocks.db,
  schema: mocks.schema,
}));

import { aggregateBucket } from './model-health-aggregator';

/** 记录 insert values 的链式 mock（values → onConflictDoUpdate） */
let insertValues: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.resetAllMocks();
  insertValues = [];
  const chain = {
    values: vi.fn((v: Record<string, unknown>) => {
      insertValues.push(v);
      return chain;
    }),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  mocks.db.insert.mockReturnValue(chain);
});

/** 递归提取 drizzle SQL 对象的文本（queryChunks: string | StringChunk | SQL | Param） */
function sqlText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (chunk == null) return '';
  const c = chunk as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(c.queryChunks)) return c.queryChunks.map(sqlText).join('');
  if (Array.isArray(c.value)) return c.value.join(''); // StringChunk
  return ''; // Param / Name / Table / Column
}

describe('model-health-aggregator 上游延迟接入口径', () => {
  it('聚合 SQL 以 completed_at - occurred_at 计算延迟，桶边界与 LATENCY_BOUNDARIES 一致', async () => {
    mocks.db.execute.mockResolvedValue([]);

    await aggregateBucket(1_700_000_000_000, 1_700_000_300_000);

    expect(mocks.db.execute).toHaveBeenCalledTimes(1);
    const sqlTextValue = sqlText(mocks.db.execute.mock.calls[0]![0]);
    // 延迟表达式：completed_at - occurred_at（EXTRACT EPOCH 秒 → 毫秒）
    expect(sqlTextValue).toContain('EXTRACT(EPOCH FROM (completed_at - occurred_at)) * 1000');
    // 桶边界与 lib/latency.ts 单一来源一致（首桶 0 与末桶 5000 兜底）
    const latExpr = 'EXTRACT(EPOCH FROM (completed_at - occurred_at)) * 1000';
    for (const b of LATENCY_BOUNDARIES.slice(1)) {
      expect(sqlTextValue).toContain(`WHEN ${latExpr} < ${b}`);
    }
    expect(sqlTextValue).toContain(`ELSE ${LATENCY_BOUNDARIES[LATENCY_BOUNDARIES.length - 1]} END`);
  });

  it('延迟桶计数折叠进 latencyHist，成功/失败计数口径正确', async () => {
    // 模拟聚合查询结果：成功 3 条落在 200ms 桶，失败 1 条（500）落在 3000ms 桶
    mocks.db.execute.mockResolvedValue([
      { requested_model: 'deepseek-v3', supplier_id: 1, supplier_model_id: 3, is_error: false, error_code: null, lat_bucket: 200, cnt: 3 },
      { requested_model: 'deepseek-v3', supplier_id: 1, supplier_model_id: 3, is_error: true, error_code: '500', lat_bucket: 3000, cnt: 1 },
    ]);

    await aggregateBucket(1_700_000_000_000, 1_700_000_300_000);

    expect(insertValues).toHaveLength(1);
    const row = insertValues[0]!;
    expect(row.platformModel).toBe('deepseek-v3');
    expect(row.supplierId).toBe(1);
    expect(row.supplierModelId).toBe(3);
    // 延迟已纳入聚合输入：latencyHist 按桶计数
    expect(row.latencyHist).toEqual({ '200': 3, '3000': 1 });
    // 成功/失败口径：status <> 'succeeded' 记为失败
    expect(row.requestCount).toBe(4);
    expect(row.successCount).toBe(3);
    expect(row.errorCount).toBe(1);
    expect(row.errorCodeDist).toEqual({ '500': 1 });
  });

  it('无数据 → 不写桶（不产生 insert）', async () => {
    mocks.db.execute.mockResolvedValue([]);

    await aggregateBucket(1_700_000_000_000, 1_700_000_300_000);

    expect(insertValues).toHaveLength(0);
  });
});
