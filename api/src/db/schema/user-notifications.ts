import { pgTable, serial, integer, varchar, timestamp, boolean, text, numeric } from 'drizzle-orm/pg-core';
import { priceChangeLogs } from './price-change-logs';

/**
 * 用户通知记录 — 对齐 PRD §3.3 user_notifications
 * 每个受影响用户一条，含影响评分与通知级别
 */
export const userNotifications = pgTable('user_notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  priceChangeLogId: integer('price_change_log_id').references(() => priceChangeLogs.id),
  tier: varchar('tier', { length: 1 }).notNull(),
  impactScore: numeric('impact_score', { precision: 6, scale: 2 }),
  title: varchar('title', { length: 200 }),
  content: text('content'),
  channel: varchar('channel', { length: 20 }).notNull().default('in_app'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  isWeeklySummary: boolean('is_weekly_summary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
