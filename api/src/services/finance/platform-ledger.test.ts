/**
 * 平台总账服务集成测试 — 复式分录平衡 + 科目汇总（PRD §29.1，migration 0044）
 *
 * 覆盖差距矩阵 F（§29.1）验收：
 *   - 充值 $10 → ledger 写入两条分录（debit user_balance / credit revenue，金额相等）
 *   - 消费 $1  → ledger 写入两条分录（debit cost / credit user_balance），借=贷
 *   - summary  → 按科目返回余额，且全平台会计恒等式成立（totalDebit == totalCredit）
 *
 * 用真实 PG（本地 threecloud_v3）；测试数据以专属 refType='test_*' 隔离，afterAll 清理。
 *
 * @module services/finance/platform-ledger.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import {
  recordRechargeLedger,
  recordConsumptionLedger,
  listLedger,
  ledgerSummary,
} from './platform-ledger.js';

const TEST_USER = 999999;
const RECHARGE_REF = 900001;
const CONSUMPTION_REF = 900002;

describe('platform_ledger 平台总账', () => {
  beforeAll(async () => {
    // 清理可能的残留（幂等）
    await db.delete(schema.platformLedger)
      .where(inArray(schema.platformLedger.refType, ['test_recharge', 'test_consumption']));
  });

  afterAll(async () => {
    await db.delete(schema.platformLedger)
      .where(inArray(schema.platformLedger.refType, ['test_recharge', 'test_consumption']));
  });

  it('充值 $10 → 写入两条分录，debit user_balance = credit revenue = 1000 分', async () => {
    await recordRechargeLedger(db, {
      userId: TEST_USER,
      amountYuan: '10',
      refType: 'test_recharge',
      refId: RECHARGE_REF,
      description: '测试充值',
    });

    const rows = await db.select()
      .from(schema.platformLedger)
      .where(eq(schema.platformLedger.refType, 'test_recharge'));

    expect(rows).toHaveLength(2);
    const debit = rows.find(r => r.direction === 'debit')!;
    const credit = rows.find(r => r.direction === 'credit')!;
    expect(debit.account).toBe('user_balance');
    expect(credit.account).toBe('revenue');
    expect(Number(debit.amountCents)).toBe(1000);
    expect(Number(credit.amountCents)).toBe(1000);
  });

  it('消费 $1 → 写入两条分录，debit cost = credit user_balance = 100 分', async () => {
    await recordConsumptionLedger(db, {
      userId: TEST_USER,
      amountYuan: '1',
      refType: 'test_consumption',
      refId: CONSUMPTION_REF,
      requestId: 'req-test-ledger-1',
    });

    const rows = await db.select()
      .from(schema.platformLedger)
      .where(eq(schema.platformLedger.refType, 'test_consumption'));

    expect(rows).toHaveLength(2);
    const debit = rows.find(r => r.direction === 'debit')!;
    const credit = rows.find(r => r.direction === 'credit')!;
    expect(debit.account).toBe('cost');
    expect(credit.account).toBe('user_balance');
    expect(Number(debit.amountCents)).toBe(100);
    expect(Number(credit.amountCents)).toBe(100);
  });

  it('listLedger 分页可按科目筛选', async () => {
    const res = await listLedger({ account: 'revenue', page: 1, pageSize: 10 });
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.items.every(i => i.account === 'revenue')).toBe(true);
  });

  it('ledgerSummary 返回科目余额且会计恒等式成立（totalDebit == totalCredit）', async () => {
    const summary = await ledgerSummary();
    expect(Array.isArray(summary.accounts)).toBe(true);
    expect(summary.totalDebitCents).toBe(summary.totalCreditCents);
    expect(summary.balanced).toBe(true);

    // 测试数据落点：revenue 与 cost 科目都应有余额
    const revenue = summary.accounts.find(a => a.account === 'revenue');
    const cost = summary.accounts.find(a => a.account === 'cost');
    expect(revenue).toBeDefined();
    expect(cost).toBeDefined();
    expect(revenue!.creditCents).toBeGreaterThanOrEqual(1000);
    expect(cost!.debitCents).toBeGreaterThanOrEqual(100);
  });
});
