import { pgTable, serial, varchar, jsonb, boolean, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * 全局 Webhook 订阅配置（产品裁决 2026-08-15，对齐 ref-32 §32.1）
 *
 * 平台级事件推送（user.created / recharge.completed / withdraw.created /
 * agent.commission_settled / alert.triggered / model.price_changed 等），
 * 投递时以 secret 做 HMAC-SHA256 签名（X-3Cloud-Signature），支持自动重试。
 */
export const adminWebhooks = pgTable('admin_webhooks', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  secret: varchar('secret', { length: 100 }).notNull(),
  events: jsonb('events').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  retryCount: integer('retry_count').notNull().default(3),
  timeoutMs: integer('timeout_ms').notNull().default(5000),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
