import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 客服知识库文章
 *
 * 对齐原型「知识库管理」：管理端维护常见问题/操作指引，
 * 供客服回复与用户自助查阅复用。status 取值 draft | published。
 */
export const knowledgeBaseArticles = pgTable('knowledge_base_articles', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 100 }).notNull().default('general'),
  content: text('content').notNull(),
  /** 文章状态：draft（草稿）/ published（已发布） */
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  /** 创建人（管理员用户 id，可空） */
  createdBy: integer('created_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
