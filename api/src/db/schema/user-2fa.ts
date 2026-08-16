/**
 * user_2fa — 用户双因素认证（TOTP + 备用码）配置
 *
 * 职责：
 * - 存储 TOTP secret（base32 编码）、启用状态、备用码 bcrypt 哈希数组
 * - 2FA 启用状态以本表 totp_enabled 为权威，与 users.two_factor_enabled 保持同步
 *   （enable/disable 时两处一起写，login 直接读 users.two_factor_enabled 判断）
 *
 * @see kb/3cloud/tech-architecture.md §3.1 user_2fa
 * @module db/schema
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const user2fa = pgTable('user_2fa', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  /** TOTP secret（base32），不落明文备用码 */
  totpSecret: varchar('totp_secret', { length: 255 }).notNull(),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  /** 备用码 bcrypt 哈希数组（明文只在 setup 时返回一次） */
  backupCodes: jsonb('backup_codes').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdUnique: uniqueIndex('uq_user_2fa_user_id').on(table.userId),
}));

export type User2fa = typeof user2fa.$inferSelect;
export type NewUser2fa = typeof user2fa.$inferInsert;
