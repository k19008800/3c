/**
 * 第三方登录绑定表 — user_oauth_bindings
 *
 * 记录用户与第三方 OAuth 身份（GitHub / 预留 wechat / telegram）的绑定关系。
 * 一个用户可绑定多个第三方身份（不同 provider 或同 provider 多账号），
 * 一个第三方 openId 只能绑定一个用户（(provider, open_id) 联合唯一）。
 *
 * 设计来源：tech-architecture.md §3.1 账号安全 — user_oauth_bindings 表。
 * 注意：外键不级联删除，保留绑定历史（编码规范 §2.2）。
 *
 * @module db/schema
 */

import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userOauthBindings = pgTable('user_oauth_bindings', {
  id: serial('id').primaryKey(),
  /** 绑定到的本地用户（users.id） */
  userId: integer('user_id').notNull().references(() => users.id),
  /** 第三方平台标识：'github'，预留 'wechat' / 'telegram' */
  provider: varchar('provider', { length: 30 }).notNull(),
  /** 第三方平台用户唯一 ID（如 GitHub 的 numeric user id 字符串） */
  openId: varchar('open_id', { length: 255 }).notNull(),
  /** 第三方返回的邮箱（可能为空，如 GitHub 未授权邮箱或用户无公开邮箱） */
  email: varchar('email', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  /** 同一第三方身份只能绑定一个用户 */
  providerOpenIdUnique: uniqueIndex('uq_user_oauth_bindings_provider_open_id').on(table.provider, table.openId),
  /** 按用户反查绑定列表（如「我的账号安全 - 已绑定登录方式」） */
  userIdIdx: index('idx_user_oauth_bindings_user_id').on(table.userId),
}));

export type UserOAuthBinding = typeof userOauthBindings.$inferSelect;
export type NewUserOAuthBinding = typeof userOauthBindings.$inferInsert;
