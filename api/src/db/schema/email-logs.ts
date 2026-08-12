import { pgTable, serial, integer, varchar, timestamp, text } from 'drizzle-orm/pg-core';

/**
 * 邮件发送日志 — 供 AdminEmailTemplatesPage「发送日志」Tab 与分发邮件记录
 */
export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  toAddress: varchar('to_address', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 300 }),
  templateName: varchar('template_name', { length: 100 }),
  content: text('content'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
