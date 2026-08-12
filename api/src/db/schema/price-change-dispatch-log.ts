import { pgTable, serial, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { priceChangeLogs } from './price-change-logs';

/**
 * 分发执行日志 — 对齐 PRD §3.4 price_change_dispatch_log
 * 记录每次分发评估的用户数与各级通知数
 */
export const priceChangeDispatchLog = pgTable('price_change_dispatch_log', {
  id: serial('id').primaryKey(),
  priceChangeLogId: integer('price_change_log_id').notNull().references(() => priceChangeLogs.id),
  totalUsersEvaluated: integer('total_users_evaluated').notNull().default(0),
  tierACount: integer('tier_a_count').notNull().default(0),
  tierBCount: integer('tier_b_count').notNull().default(0),
  tierCCount: integer('tier_c_count').notNull().default(0),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
  errorMessage: text('error_message'),
});
