import { pgTable, serial, varchar, timestamp, text, jsonb } from 'drizzle-orm/pg-core';

export const emailTemplates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  subject: varchar('subject', { length: 300 }).notNull(),
  body: text('body').notNull(),
  variables: jsonb('variables').$type<string[]>().default([]),
  language: varchar('language', { length: 10 }).default('zh-CN'),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
