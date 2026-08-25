import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const rechargeOrderStatusEnum = pgEnum('recharge_order_status', [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
]);

export const rechargeOrders = pgTable('recharge_orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  orderNo: varchar('order_no', { length: 50 }).notNull().unique(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  method: varchar('method', { length: 30 }).notNull(),
  status: rechargeOrderStatusEnum('status').notNull().default('pending'),
  paidAt: timestamp('paid_at'),
  note: text('note'),
  metadata: jsonb('metadata'),
  /** 幂等键（R1 人工上账创建 Idempotency-Key L2 唯一兜底；migration 0027） */
  idempotencyKey: varchar('idempotency_key', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // L2 幂等唯一索引（migration 0027）：同 Idempotency-Key 重复创建拒绝
  idempotencyKeyUnique: uniqueIndex('uq_recharge_orders_idempotency_key').on(table.idempotencyKey),
  // 转账单号全平台唯一（migration 0028）：表达式部分唯一索引，仅约束已填写 transfer_no 的行
  // （metadata->>'transfer_no' IS NOT NULL）。drizzle 表达式索引仅为类型层同步声明，
  // 实际 DDL 以 migrations/0028_recharge_orders_transfer_no_unique.sql 为准，禁止 db:push 覆盖。
  transferNoUnique: uniqueIndex('uq_recharge_orders_transfer_no')
    .on(sql`(metadata->>'transfer_no')`)
    .where(sql`metadata->>'transfer_no' IS NOT NULL`),
}));
