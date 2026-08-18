import { pgTable, serial, integer, varchar, timestamp, numeric, text } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 消费争议记录（2026-08 补齐，对齐原型 admin-dispute.html）
 *
 * 状态机：pending(待处理) → investigating(调查中) → refunded(已退款) / dismissed(已驳回)
 * amount 单位：分（前端契约 Dispute.amount 展示 amount/100 元，与原型一致）。
 */
export const disputes = pgTable('disputes', {
  id: serial('id').primaryKey(),
  /** 争议单号：DS + yyyyMMdd + 序号 */
  disputeNo: varchar('dispute_no', { length: 50 }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull().default('0'),
  reason: text('reason').notNull(),
  /** pending | investigating | refunded | dismissed */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  handlerId: integer('handler_id').references(() => users.id),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Dispute = typeof disputes.$inferSelect;
