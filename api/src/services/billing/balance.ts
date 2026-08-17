/**
 * 余额服务 — 原子余额操作（P0-1 起支持 frozen 语义）
 *
 * 使用 PostgreSQL 乐观锁（version 字段）保证并发安全。
 * P0-1（阈值旁路预扣）新增：
 *   - `freezeBalance` / `settleFrozenBalance` / `releaseFrozenBalance`：预扣的 PG 侧
 *     镜像（available ↔ frozen 转移），与 Redis 热账本（ledger.ts）双写保持一致；
 *   - `deductBalance` 支持 `allowNegative`：旁路扣费的极端并发竞态允许记负
 *     （配合 risk_events + 强制预扣标记，见 pre-consume.ts）；
 *   - 每次余额变更尽力同步 Redis 热账本 available（账本缺失则跳过，下次预扣自愈）。
 *
 * @see coding-standards-control-logic.md §五 双层余额 + Redis Lua 原子预扣
 * @module services/billing
 */

import { db, schema } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { AppError, InsufficientBalanceError } from '../../lib/errors';
import { adjustLedgerAvailable, clearNegativeFlag } from './ledger';

/** deductBalance 可选参数 */
export interface DeductOptions {
  /** 允许余额扣成负数（旁路扣费的极端并发竞态兜底）；默认 false 严格校验 */
  allowNegative?: boolean;
}

/**
 * 扣减余额（事后扣费）
 *
 * @param userId - 用户 ID
 * @param amount - 扣减金额（元，字符串）
 * @param referenceType - 引用类型（consumption 等）
 * @param referenceId - 引用 ID（requestId 等）
 * @param opts - 可选参数（allowNegative）
 * @returns 扣减后余额与版本号
 * @throws {AppError} 404 BALANCE_NOT_FOUND
 * @throws {InsufficientBalanceError} 402 余额不足（allowNegative=false 时）
 */
export async function deductBalance(
  userId: number,
  amount: string,
  referenceType: string,
  referenceId: string,
  opts?: DeductOptions,
): Promise<{ balanceAfter: string; version: number }> {
  const allowNegative = opts?.allowNegative === true;
  // UPDATE ... RETURNING 带余额校验；allowNegative 时跳过校验（允许记负）
  const result = await db.execute(sql`
    UPDATE customer_balances
    SET 
      available_balance = available_balance - ${amount}::numeric,
      total_balance = total_balance - ${amount}::numeric,
      version = version + 1,
      updated_at = NOW()
    WHERE user_id = ${userId}
      ${allowNegative ? sql`` : sql`AND available_balance >= ${amount}::numeric`}
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

  // 同步 Redis 热账本 available（尽力而为；账本缺失跳过，下次预扣从 PG 自愈）
  await adjustLedgerAvailable(userId, -Number(amount));

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
 * 增加余额（充值、退款、佣金、调整）
 *
 * 充值回正时清除负余额强制预扣标记（P0-1：负余额用户充值后恢复旁路资格）。
 *
 * @param userId - 用户 ID
 * @param amount - 增加金额（元，字符串）
 * @param type - 类型（recharge/refund/commission/adjustment）
 * @param referenceType - 引用类型（可选）
 * @param referenceId - 引用 ID（可选）
 * @returns 增加后余额
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

  // 同步 Redis 热账本 available + 充值回正时清除负余额强制预扣标记
  await adjustLedgerAvailable(userId, Number(amount));
  if (Number(row.balanceAfter) >= 0) {
    await clearNegativeFlag(userId);
  }

  // Log transaction
  await db.insert(schema.balanceTransactions).values({
    userId,
    type,
    amount,
    balanceAfter: row.balanceAfter,
    referenceType: referenceType || null,
    referenceId: referenceId || null,
  });

  // 退款冲销钩子：客户退款（冲回消费）时，同步冲销该笔消费对应的代理佣金。
  // addBalance 是余额变更唯一咽喉，未来任何退款路径走这里即自动触发冲销。
  if (type === 'refund' && referenceType === 'consumption' && referenceId) {
    const { cancelCommissionsForConsumption, resolveConsumptionRecordId } = await import('../agent/commission');
    const consumptionRecordId = await resolveConsumptionRecordId(referenceId);
    if (consumptionRecordId) {
      await cancelCommissionsForConsumption({ consumptionRecordId }).catch((e) => {
        // 冲销失败不应阻断退款落账，记录告警便于对账兜底
        console.error(`[balance] refund commission write-off failed for consumption ${referenceId}:`, e);
      });
    }
  }

  return { balanceAfter: row.balanceAfter };
}

/**
 * 冻结余额（预扣的 PG 镜像）：available -amount、frozen +amount
 *
 * 由 preConsume 在 Redis Lua 冻结成功后调用，保证 PG 与 Redis 热账本一致；
 * 若此步失败（PG 异常），调用方应释放 Redis 冻结并返回 500（资金安全优先）。
 *
 * @param userId - 用户 ID
 * @param amount - 冻结金额（元，字符串）
 * @param requestId - 请求 ID（balance_transactions 引用）
 * @returns 冻结后可用余额
 */
export async function freezeBalance(
  userId: number,
  amount: string,
  requestId: string,
): Promise<{ balanceAfter: string }> {
  const result = await db.execute(sql`
    UPDATE customer_balances
    SET 
      available_balance = available_balance - ${amount}::numeric,
      frozen_balance = frozen_balance + ${amount}::numeric,
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

  await db.insert(schema.balanceTransactions).values({
    userId,
    type: 'freeze',
    amount: `-${amount}`,
    balanceAfter: row.balanceAfter,
    referenceType: 'pre_consume',
    referenceId: requestId,
  });

  return { balanceAfter: row.balanceAfter };
}

/**
 * 结算冻结（预扣结算的 PG 镜像）：available += (frozen - actual)、frozen -= frozen
 *
 * 与 Redis 结算结果一致的多退少补：
 *   - actual ≤ frozen → 差额退回 available（多退）；
 *   - actual > frozen → 差额从 available 补扣（少补，Redis 侧已校验可用性）。
 *
 * @param userId - 用户 ID
 * @param frozenAmount - 预扣冻结金额（元，字符串）
 * @param actualAmount - 实际消费金额（元，字符串）
 * @param requestId - 请求 ID（balance_transactions 引用）
 * @returns 结算后可用余额
 */
export async function settleFrozenBalance(
  userId: number,
  frozenAmount: string,
  actualAmount: string,
  requestId: string,
): Promise<{ balanceAfter: string }> {
  const result = await db.execute(sql`
    UPDATE customer_balances
    SET 
      available_balance = available_balance + (${frozenAmount}::numeric - ${actualAmount}::numeric),
      frozen_balance = frozen_balance - ${frozenAmount}::numeric,
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

  await db.insert(schema.balanceTransactions).values({
    userId,
    type: 'consumption',
    amount: `-${actualAmount}`,
    balanceAfter: row.balanceAfter,
    referenceType: 'pre_consume',
    referenceId: requestId,
  });

  return { balanceAfter: row.balanceAfter };
}

/**
 * 解冻余额（预扣释放的 PG 镜像）：available +frozen、frozen -frozen
 *
 * 异常中断/上游失败时由 releasePreConsume 调用，全额退回冻结。
 *
 * @param userId - 用户 ID
 * @param frozenAmount - 释放的冻结金额（元，字符串）
 * @param requestId - 请求 ID（balance_transactions 引用）
 * @returns 解冻后可用余额
 */
export async function releaseFrozenBalance(
  userId: number,
  frozenAmount: string,
  requestId: string,
): Promise<{ balanceAfter: string }> {
  const result = await db.execute(sql`
    UPDATE customer_balances
    SET 
      available_balance = available_balance + ${frozenAmount}::numeric,
      frozen_balance = frozen_balance - ${frozenAmount}::numeric,
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

  await db.insert(schema.balanceTransactions).values({
    userId,
    type: 'unfreeze',
    amount: `+${frozenAmount}`,
    balanceAfter: row.balanceAfter,
    referenceType: 'pre_consume',
    referenceId: requestId,
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
