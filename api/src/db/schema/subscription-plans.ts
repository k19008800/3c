import { pgTable, serial, varchar, numeric, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * 订阅套餐表（对齐原型 admin-subscription.html）
 *
 * 原型有但后端缺失 → 本文件为新增（migration: 0021_subscription_plans.sql）。
 * price 单位：分（前端按 /100 展示为元）；quota 为 jsonb 配额明细（如 { token_month: "1000万", ... }）。
 */
export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  price: numeric('price', { precision: 18, scale: 2 }).notNull().default('0'),
  quota: jsonb('quota').$type<Record<string, unknown>>().notNull().default({}),
  billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('monthly'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
