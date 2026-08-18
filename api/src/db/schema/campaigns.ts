import { pgTable, serial, varchar, timestamp, text, jsonb, integer, boolean, numeric } from 'drizzle-orm/pg-core';

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 50 }).notNull().default('recharge_bonus'),
  description: text('description'),
  config: jsonb('config').notNull(),
  /** 活动预算（元），migration 0023a 补充 */
  budgetAmount: numeric('budget_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  startAt: timestamp('start_at'),
  endAt: timestamp('end_at'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
