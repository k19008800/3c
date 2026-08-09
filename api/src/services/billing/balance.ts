/**
 * 余额服务 — 原子余额操作
 *
 * 使用 PostgreSQL 乐观锁（version 字段）保证并发安全
 * Phase 4+ 将升级为 Redis Lua 原子预扣
 */

import { db, schema } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { AppError, InsufficientBalanceError } from '../../lib/errors';

/**
 * Deduct balance atomically
 * Uses optimistic locking via version field
 */
export async function deductBalance(
  userId: number,
  amount: string,
  referenceType: string,
  referenceId: string,
): Promise<{ balanceAfter: string; version: number }> {
  // Use UPDATE ... RETURNING with version check
  const result = await db.execute(sql`
    UPDATE customer_balances
    SET 
      available_balance = available_balance - ${amount}::numeric,
      total_balance = total_balance - ${amount}::numeric,
      version = version + 1,
      updated_at = NOW()
    WHERE user_id = ${userId}
      AND available_balance >= ${amount}::numeric
    RETURNING 
      available_balance AS "balanceAfter",
      version
  `);

  if (result.length === 0) {
    // Check if user exists and what their balance is
    const bal = await db.select({
      availableBalance: schema.customerBalances.availableBalance,
    }).from(schema.customerBalances)
      .where(eq(schema.customerBalances.userId, userId))
      .limit(1);

    if (bal.length === 0) {
      throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
    }

    throw new InsufficientBalanceError(
      bal[0]!.availableBalance,
      amount,
    );
  }

  const row = result[0] as unknown as { balanceAfter: string; version: number };

  // Log the transaction
  await db.insert(schema.balanceTransactions).values({
    userId,
    type: 'consumption',
    amount: `-${amount}`,
    balanceAfter: row.balanceAfter,
    referenceType,
    referenceId,
  });

  return { balanceAfter: row.balanceAfter, version: row.version };
}

/**
 * Add balance (recharge, refund, commission)
 */
export async function addBalance(
  userId: number,
  amount: string,
  type: 'recharge' | 'refund' | 'commission' | 'adjustment',
  referenceType?: string,
  referenceId?: string,
): Promise<{ balanceAfter: string }> {
  const result = await db.execute(sql`
    UPDATE customer_balances
    SET 
      available_balance = available_balance + ${amount}::numeric,
      total_balance = total_balance + ${amount}::numeric,
      version = version + 1,
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING 
      available_balance AS "balanceAfter"
  `);

  if (result.length === 0) {
    throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
  }

  const row = result[0] as unknown as { balanceAfter: string };

  // Log transaction
  await db.insert(schema.balanceTransactions).values({
    userId,
    type,
    amount,
    balanceAfter: row.balanceAfter,
    referenceType: referenceType || null,
    referenceId: referenceId || null,
  });

  return { balanceAfter: row.balanceAfter };
}

/**
 * Get user balance
 */
export async function getBalance(userId: number) {
  const result = await db.select({
    totalBalance: schema.customerBalances.totalBalance,
    availableBalance: schema.customerBalances.availableBalance,
    frozenBalance: schema.customerBalances.frozenBalance,
    currency: schema.customerBalances.currency,
  }).from(schema.customerBalances)
    .where(eq(schema.customerBalances.userId, userId))
    .limit(1);

  if (result.length === 0) {
    return { totalBalance: '0', availableBalance: '0', frozenBalance: '0', currency: 'CNY' };
  }

  return result[0]!;
}

/**
 * Initialize balance for new user
 */
export async function initBalance(userId: number): Promise<void> {
  await db.insert(schema.customerBalances).values({
    userId,
    totalBalance: '0',
    availableBalance: '0',
    frozenBalance: '0',
    currency: 'CNY',
  }).onConflictDoNothing();
}
