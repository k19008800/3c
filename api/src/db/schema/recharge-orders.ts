import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text, jsonb } from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
