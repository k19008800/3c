/**
 * 用户分组（Group）表结构
 *
 * 补齐 New API 用户分组能力（newapi-gap-analysis.md Batch 2 任务 2.3）：
 * - user_groups：分组定义，控制「可用模型 / 配额上限 / 速率限制 / 价格倍率」
 * - user_group_memberships：用户 ↔ 分组 绑定（一个用户一个组，简单模型，userId 唯一）
 *
 * pricingGroup 关联现有 abilities.pricing_group（如 'default' / 'vip' / 'internal'），
 * 为 NULL 表示使用默认组，见 tech-architecture.md §3.3。
 *
 * @module db/schema/user-groups
 * @see tech-architecture.md §3.3 abilities.pricing_group
 */

import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const userGroups = pgTable(
  'user_groups',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull(),
    description: varchar('description', { length: 255 }),
    /** 关联 abilities.pricing_group；NULL = 使用默认组 */
    pricingGroup: varchar('pricing_group', { length: 50 }),
    /** 分组级 QPS 上限，NULL = 不限 */
    rateLimitQps: integer('rate_limit_qps'),
    /** 分组级 TPM 上限，NULL = 不限 */
    rateLimitTpm: integer('rate_limit_tpm'),
    /** 分组级日消费额度上限（元），NULL = 不限 */
    dailyQuota: numeric('daily_quota', { precision: 12, scale: 2 }),
    /** 可用平台模型名数组，空数组 = 全部可用 */
    modelWhitelist: jsonb('model_whitelist').$type<string[]>().default([]),
    /** 默认组（新注册用户自动归属）；同一时刻最多一个 true */
    isDefault: boolean('is_default').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex('uq_user_groups_name').on(table.name),
  }),
);

export const userGroupMemberships = pgTable(
  'user_group_memberships',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    groupId: integer('group_id')
      .notNull()
      .references(() => userGroups.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    /** 一个用户一个组（简单模型） */
    userUnique: uniqueIndex('uq_user_group_memberships_user_id').on(table.userId),
  }),
);

export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMembership = typeof userGroupMemberships.$inferSelect;
export type NewUserGroupMembership = typeof userGroupMemberships.$inferInsert;
