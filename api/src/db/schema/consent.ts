import { pgTable, serial, integer, varchar, timestamp, text } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 合规策略（隐私政策 / 服务条款等）— 2026-08 补齐，对齐原型 admin-consent.html
 *
 * 每次编辑版本号 +1 并写 audit_logs（敏感操作全程留痕）；
 * status: draft(草稿) | published(已发布) | revoked(已撤销)。
 */
export const consentPolicies = pgTable('consent_policies', {
  id: serial('id').primaryKey(),
  /** 策略键：privacy_policy | terms_of_service | ... */
  key: varchar('key', { length: 50 }).notNull().unique(),
  /** 策略名称（展示用，如「隐私政策」） */
  name: varchar('name', { length: 200 }).notNull(),
  /** 策略正文（Markdown） */
  content: text('content').notNull(),
  /** 版本号，编辑时 +1 */
  version: integer('version').notNull().default(1),
  status: varchar('status', { length: 20 }).notNull().default('published'),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** 用户同意记录（action: agree 同意 / disagree 拒绝） */
export const consentLogs = pgTable('consent_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  policyId: integer('policy_id').notNull().references(() => consentPolicies.id),
  action: varchar('action', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type ConsentPolicy = typeof consentPolicies.$inferSelect;
export type ConsentLog = typeof consentLogs.$inferSelect;
