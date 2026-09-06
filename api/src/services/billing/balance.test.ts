/**
 * creditBalance 统一入账收口测试 — 无余额行兜底 / 有行累加 / 并发（真实 PG）
 *
 * 覆盖 ARCH §8 用例 8–10：
 *   8. 无行兜底：INSERT ON CONFLICT 建行 → UPDATE 增额 → 流水；事务回滚时三写全部回滚
 *   9. 有行：余额正确累加、version+1、流水一条、不产生第二行
 *   10. 并发：同用户并发 10 次入账（各自事务）→ 余额=10×amount，流水 10 条（不丢更新）
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §4 creditBalance / §8 用例 8-10
 * @module services/billing/balance.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../db/index.js';
import { and, eq, inArray } from 'drizzle-orm';
import { creditBalance } from './balance.js';

const ts = Date.now();

let noRowUserId = 0;
let existingUserId = 0;
let concurrentUserId = 0;

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

beforeAll(async () => {
  const [u1] = await db.insert(schema.users).values({
    email: `bal-norow-${ts}@test.com`, passwordHash: 'x', name: 'BalNoRow', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  noRowUserId = u1!.id;

  const [u2] = await db.insert(schema.users).values({
    email: `bal-exist-${ts}@test.com`, passwordHash: 'x', name: 'BalExist', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  existingUserId = u2!.id;
  await db.insert(schema.customerBalances).values({
    userId: existingUserId, totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY',
  });

  const [u3] = await db.insert(schema.users).values({
    email: `bal-cc-${ts}@test.com`, passwordHash: 'x', name: 'BalConcurrent', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  concurrentUserId = u3!.id;
});

afterAll(async () => {
  try {
    const ids = [noRowUserId, existingUserId, concurrentUserId].filter((x) => x > 0);
    await db.delete(schema.balanceTransactions).where(inArray(schema.balanceTransactions.userId, ids));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, ids));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  } catch (err) {
    console.error('[balance.test] cleanup failed:', err);
  }
});

describe('creditBalance', () => {
  it('用例8 无余额行 → 自动建户 + 增额 + 流水；事务回滚时三写全部回滚', async () => {
    // 正常提交路径
    const { balanceAfter } = await db.transaction(async (tx) => creditBalance(tx, {
      userId: noRowUserId,
      amount: '50.00',
      type: 'recharge',
      referenceType: 'recharge_order',
      referenceId: 'ro-bal-1',
      description: '测试入账 1',
    }));
    expect(toNum(balanceAfter)).toBeCloseTo(50, 4);

    const [bal] = await db.select({
      availableBalance: schema.customerBalances.availableBalance,
      totalBalance: schema.customerBalances.totalBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, noRowUserId)).limit(1);
    expect(bal).toBeDefined();
    expect(toNum(bal!.availableBalance)).toBeCloseTo(50, 4);
    expect(toNum(bal!.totalBalance)).toBeCloseTo(50, 4);

    const txs = await db.select({ id: schema.balanceTransactions.id })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, noRowUserId), eq(schema.balanceTransactions.referenceId, 'ro-bal-1')));
    expect(txs.length).toBe(1);

    // D-06：自动建户写审计（来源标识 auto_create）
    const [audit] = await db.select({ action: schema.auditLogs.action, details: schema.auditLogs.details })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'balance.auto_create'), eq(schema.auditLogs.resourceId, String(noRowUserId))))
      .limit(1);
    expect(audit).toBeDefined();
    expect(audit!.action).toBe('balance.auto_create');
    const ad = audit!.details as Record<string, unknown>;
    expect(ad.source).toBe('auto_create');
    expect(ad.user_id).toBe(noRowUserId);

    // 回滚路径：事务内入账后抛错 → 建行/增额/流水全部回滚
    await expect(db.transaction(async (tx) => {
      await creditBalance(tx, {
        userId: noRowUserId,
        amount: '10',
        type: 'recharge',
        referenceType: 'recharge_order',
        referenceId: 'ro-bal-rollback',
        description: '回滚测试',
      });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    const [bal2] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, noRowUserId)).limit(1);
    expect(toNum(bal2!.availableBalance)).toBeCloseTo(50, 4);   // 未变

    const rollbackRows = await db.select({ id: schema.balanceTransactions.id })
      .from(schema.balanceTransactions)
      .where(eq(schema.balanceTransactions.referenceId, 'ro-bal-rollback'));
    expect(rollbackRows.length).toBe(0);
  });

  it('用例9 已有余额行 → 余额累加 + version+1 + 流水一条，不产生第二行', async () => {
    const [before] = await db.select({
      availableBalance: schema.customerBalances.availableBalance,
      version: schema.customerBalances.version,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, existingUserId)).limit(1);
    const beforeBal = toNum(before!.availableBalance);
    const beforeVer = before!.version;

    const { balanceAfter } = await db.transaction(async (tx) => creditBalance(tx, {
      userId: existingUserId,
      amount: '25.50',
      type: 'adjustment',
      referenceType: 'adjustment',
      referenceId: 'adj-bal-1',
      description: '测试调增',
    }));
    expect(toNum(balanceAfter)).toBeCloseTo(beforeBal + 25.5, 4);

    const [after] = await db.select({
      availableBalance: schema.customerBalances.availableBalance,
      version: schema.customerBalances.version,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, existingUserId)).limit(1);
    expect(toNum(after!.availableBalance)).toBeCloseTo(beforeBal + 25.5, 4);
    expect(after!.version).toBe(beforeVer + 1);

    const rows = await db.select({ id: schema.customerBalances.id }).from(schema.customerBalances)
      .where(eq(schema.customerBalances.userId, existingUserId));
    expect(rows.length).toBe(1);   // 不产生第二行

    const txs = await db.select({ type: schema.balanceTransactions.type, balanceAfter: schema.balanceTransactions.balanceAfter })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, existingUserId), eq(schema.balanceTransactions.referenceId, 'adj-bal-1')));
    expect(txs.length).toBe(1);
    expect(txs[0]!.type).toBe('adjustment');
    expect(toNum(txs[0]!.balanceAfter)).toBeCloseTo(beforeBal + 25.5, 4);

    // D-06：已有余额行不产生 auto_create 审计（仅实际建户时写）
    const audits = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'balance.auto_create'), eq(schema.auditLogs.resourceId, String(existingUserId))));
    expect(audits.length).toBe(0);
  });

  it('用例10 并发 10 次入账（无余额行）→ 余额=10×amount，流水 10 条，不丢更新', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      db.transaction(async (tx) => creditBalance(tx, {
        userId: concurrentUserId,
        amount: 10,
        type: 'recharge',
        referenceType: 'recharge_order',
        referenceId: `ro-cc-${i}`,
        description: '并发入账',
      })),
    ));

    const [bal] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, concurrentUserId)).limit(1);
    expect(toNum(bal!.availableBalance)).toBeCloseTo(100, 4);

    const txs = await db.select({ id: schema.balanceTransactions.id })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, concurrentUserId), eq(schema.balanceTransactions.type, 'recharge')));
    expect(txs.length).toBe(10);
  });
});
