import { pgTable, serial, varchar, timestamp, text } from 'drizzle-orm/pg-core';

/**
 * 邮件模板 — 前端 AdminEmailTemplatesPage 契约字段
 * subject_zh/body_html_zh 必填，subject_en/body_html_en 可选，支持 {{变量}} 插值
 */
export const emailTemplates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  subjectZh: varchar('subject_zh', { length: 300 }).notNull(),
  subjectEn: varchar('subject_en', { length: 300 }),
  bodyHtmlZh: text('body_html_zh').notNull(),
  bodyHtmlEn: text('body_html_en'),
  description: varchar('description', { length: 300 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
