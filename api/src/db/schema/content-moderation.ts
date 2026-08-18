import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 内容审核队列表（对齐原型 admin-content-moderation.html）
 *
 * 原型有但后端缺失 → 本文件为新增（migration: 0020_content_moderation.sql）。
 * status 取值：pending（待审核）/ approved（已通过）/ rejected（已拒绝），
 * 审核时写入 moderator_id / review_note / reviewed_at。
 */
export const contentModeration = pgTable('content_moderation', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  contentType: varchar('content_type', { length: 50 }).notNull().default('text'),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  moderatorId: integer('moderator_id').references(() => users.id),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
});
