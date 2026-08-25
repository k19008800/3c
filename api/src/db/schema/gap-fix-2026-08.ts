import { pgTable, serial, integer, varchar, timestamp, text, boolean, numeric, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { announcements } from './announcements';

/**
 * 公告已读记录（2026-08-18 补齐，对齐原型 admin-announcement.html 阅读统计）
 *
 * 每条 = 某用户已读某公告；read_count = count(*) 聚合。
 * 用户端「公告中心」is_read 也基于本表判断。
 */
export const announcementReads = pgTable('announcement_reads', {
  announcementId: integer('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.announcementId, table.userId] }),
  userIdIdx: index('idx_announcement_reads_user').on(table.userId),
}));

/**
 * 退款申请（2026-08-18 补齐，对齐原型 admin-refund-review.html）
 *
 * 用户申请退款 → 管理员审核（approve/reject）→ approve 后经 balance.ts 退余额并写 balance_transactions(refund)。
 * status: pending | approved | rejected
 */
export const refundRequests = pgTable('refund_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(),
  reason: text('reason'),
  orderNo: varchar('order_no', { length: 100 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  reviewNote: text('review_note'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('idx_refund_requests_status').on(table.status),
  userIdIdx: index('idx_refund_requests_user').on(table.userId),
}));

/**
 * 业务员客户跟进提醒（2026-08-18 补齐，对齐 SPEC-§11 业务员支撑）
 *
 * 业务员（role=sales）为客户设置跟进任务：状态 pending → completed / ignored。
 */
export const followReminders = pgTable('follow_reminders', {
  id: serial('id').primaryKey(),
  salesUserId: integer('sales_user_id').notNull().references(() => users.id),
  customerUserId: integer('customer_user_id').notNull().references(() => users.id),
  content: text('content'),
  remindAt: timestamp('remind_at'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  salesIdx: index('idx_follow_reminders_sales').on(table.salesUserId, table.status),
}));

/**
 * 业务员客户标签（2026-08-18 补齐，对齐 SPEC-§11 客户标签）
 *
 * 标签：企业客户/开发者/高价值/需跟进/流失预警/已签约；同一客户可多个标签。
 */
export const customerTags = pgTable('customer_tags', {
  id: serial('id').primaryKey(),
  salesUserId: integer('sales_user_id').notNull().references(() => users.id),
  customerUserId: integer('customer_user_id').notNull().references(() => users.id),
  tag: varchar('tag', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniq: uniqueIndex('uq_customer_tags_sales_customer_tag').on(table.salesUserId, table.customerUserId, table.tag),
}));

/**
 * 业务员客户联系记录（2026-08-18 补齐，对齐 SPEC-§11 联系记录）
 *
 * 每次沟通记录：时间/方式/内容摘要/下次跟进时间。
 */
export const customerNotes = pgTable('customer_notes', {
  id: serial('id').primaryKey(),
  salesUserId: integer('sales_user_id').notNull().references(() => users.id),
  customerUserId: integer('customer_user_id').notNull().references(() => users.id),
  channel: varchar('channel', { length: 20 }).default('other'),
  content: text('content').notNull(),
  nextFollowAt: timestamp('next_follow_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  customerIdx: index('idx_customer_notes_customer').on(table.customerUserId),
}));

/**
 * 客服测试 Key（2026-08-18 补齐，对齐 AdminSupportPage 测试Key Tab）
 *
 * 生成 24h 有效的临时 Key（不计费/配额受限），用于排查用户问题，可撤销。
 */
export const supportTestKeys = pgTable('support_test_keys', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
  keyHash: varchar('key_hash', { length: 200 }).notNull(),
  associatedUserId: integer('associated_user_id').references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  createdIdx: index('idx_support_test_keys_created').on(table.createdAt),
}));

/**
 * 知识库文章反馈（2026-08-18 补齐，对齐 HelpCenterPage 有用/无用）
 */
export const knowledgeBaseFeedback = pgTable('knowledge_base_feedback', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  userId: integer('user_id').references(() => users.id),
  helpful: boolean('helpful').notNull().default(true),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  articleIdx: index('idx_kb_feedback_article').on(table.articleId),
}));
