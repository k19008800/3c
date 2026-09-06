/**
 * credit_limit_events — R6 24h 滚动窗口「加钱事件」PG 权威表（ARCH v1.1 §3.2 / migration 0029）
 *
 * 语义：
 * - scope: 'operator'（操作人）| 'user'（被入账用户），CHECK 约束见 DDL；
 * - 创建时预占（人工上账创建 / 调账调增发起 / 红冲加钱方向发起，op+user 各一行）；
 *   驳回 / 红冲扣钱方向不回退（B9/B19，无 DECRBY）；
 * - UNIQUE(scope, ref_type, ref_id)：同单同维度只计一次（幂等，重试/双写兜底）；
 * - 判定：pg_advisory_xact_lock 串行化同维度并发 + 24h 滚动 SUM + 超限拒绝；
 * - Redis `lim:op:{userId}` / `lim:user:{userId}` ZSET 为热路径缓存（提交后 ZADD 尽力同步，缺失回填）。
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §3.1/§3.2 / §5.1 migration 0029
 * @module db/schema
 */

import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const creditLimitEvents = pgTable('credit_limit_events', {
  id: serial('id').primaryKey(),
  /** 计数维度：'operator' | 'user' */
  scope: varchar('scope', { length: 10 }).notNull(),
  /** 操作人或被入账用户 ID */
  userId: integer('user_id').notNull().references(() => users.id),
  /** 事件金额（元，numeric(18,2)） */
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  /** 引用类型：manual_topup | adjustment | reverse */
  refType: varchar('ref_type', { length: 30 }).notNull(),
  /** 引用 ID（单据 ID 字符串） */
  refId: varchar('ref_id', { length: 50 }).notNull(),
  /** 事件时间（滚动窗口判定依据） */
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueEvent: uniqueIndex('uq_credit_limit_event').on(table.scope, table.refType, table.refId),
  scopeUserIdx: index('idx_credit_limit_events_scope_user').on(table.scope, table.userId, table.createdAt),
}));

export type CreditLimitEvent = typeof creditLimitEvents.$inferSelect;
export type NewCreditLimitEvent = typeof creditLimitEvents.$inferInsert;
