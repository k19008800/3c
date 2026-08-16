import { pgTable, serial, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 站点公开内容（运维配置 → 内容管理）
 * terms/privacy/about/contact/faq/help 等；后端维护 → 门户/后台展示。
 */
export const siteContents = pgTable('site_content', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('published'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
