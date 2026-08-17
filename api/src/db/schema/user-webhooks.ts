import { pgTable, serial, integer, varchar, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 用户端 Webhook 订阅配置（P1-1，对齐 SPEC-§22 数据结构）
 *
 * 用户订阅平台事件（余额预警/用量突增/失败率等），投递时以 secret 做 HMAC-SHA256 签名
 * （X-3Cloud-Signature: sha256=...），连续失败自动禁用（consecutive_failures 累计）。
 *
 * @see docs/SPEC-§22-用户端体验增强.md 数据结构段
 * @see docs/iteration-plan-v2.md P1-1
 */
export const userWebhooks = pgTable('user_webhooks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  /** HMAC-SHA256 签名密钥（创建/regenerate-secret 时自动生成，仅返回一次） */
  secret: varchar('secret', { length: 100 }).notNull(),
  /** 订阅事件列表，如 ["balance.low", "budget.exceeded"] */
  events: jsonb('events').notNull(),
  /** 余额不足阈值（元），默认 10 */
  balanceThreshold: integer('balance_threshold'),
  /** 调用量突增倍数，默认 3 */
  usageSpikeMultiplier: integer('usage_spike_multiplier'),
  /** 失败率阈值（%），默认 5 */
  failureRateThreshold: integer('failure_rate_threshold'),
  enabled: boolean('enabled').notNull().default(true),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  lastSentAt: timestamp('last_sent_at'),
  /** 'success' | 'failed' */
  lastStatus: varchar('last_status', { length: 20 }),
  lastResponseCode: integer('last_response_code'),
  lastFailedReason: varchar('last_failed_reason', { length: 200 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdEnabledIdx: index('idx_webhooks_user_enabled').on(table.userId, table.enabled),
}));
