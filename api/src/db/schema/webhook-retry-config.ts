import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * 全局 Webhook 重试配置（运维配置 → Webhook 重试）
 * 每个 webhook 端点（默认回调）的重试策略；默认回调策略存于本表，后台可改。
 */
export const webhookRetryConfigs = pgTable('webhook_retry_config', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  webhookUrl: varchar('webhook_url', { length: 500 }).notNull(),
  maxRetries: integer('max_retries').notNull().default(3),
  retryDelaySeconds: integer('retry_delay_seconds').notNull().default(60),
  backoffMultiplier: integer('backoff_multiplier').notNull().default(2),
  enabled: varchar('enabled', { length: 20 }).notNull().default('true'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
