import {
  pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text,
  index, primaryKey,
} from 'drizzle-orm/pg-core';

export const balanceTransactionTypeEnum = pgEnum('balance_transaction_type', [
  'recharge',
  'consumption',
  'refund',
  'adjustment',
  'commission',
  'withdrawal',
  'freeze',
  'unfreeze',
]);

/**
 * 资金流水表（P3-1 起为按月 RANGE 分区表，migration 0025）
 *
 * ⚠️ 分区表硬性要求：唯一约束/主键必须包含分区列 created_at →
 *   主键为复合 (id, created_at)（drizzle primaryKey({ columns })）。
 *
 * 实际 DDL 由 api/src/db/migrations/0025_partition_big_tables.sql 手工维护
 * （drizzle-kit 生成不了分区 DDL，禁止 db:push 覆盖），本文件仅为类型层同步。
 */
export const balanceTransactions = pgTable('balance_transactions', {
  id: serial('id'),
  userId: integer('user_id').notNull(),
  type: balanceTransactionTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 8 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: varchar('reference_id', { length: 100 }),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // 分区表复合主键（id, created_at）
  pk: primaryKey({ columns: [table.id, table.createdAt] }),
  // 高频查询索引（migration 0025 创建）：资金流水按用户查询
  userIdCreatedAtIdx: index('idx_balance_transactions_user_created').on(table.userId, table.createdAt),
  // admin-finance 退款统计 / 月结（type + 时间范围）
  typeCreatedAtIdx: index('idx_balance_transactions_type_created').on(table.type, table.createdAt),
}));
