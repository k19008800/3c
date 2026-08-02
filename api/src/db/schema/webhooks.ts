import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 全局 Webhook 配置
 * 对齐 docs/ref-32-sso-integration.md §32.1
 */
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  events: text("events").notNull(), // JSON 数组: ["user.created","recharge.completed",...]
  secret: varchar("secret", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  retryCount: integer("retry_count").notNull().default(3),
  timeoutMs: integer("timeout_ms").notNull().default(5000),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Webhook 投递日志
 */
export const webhookDeliveryLogs = pgTable(
  "webhook_delivery_logs",
  {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 50 }).notNull(),
    payload: text("payload"),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    latencyMs: integer("latency_ms"),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | success | failed | timeout
    attempt: integer("attempt").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    webhookIdx: index("idx_wh_log_webhook").on(table.webhookId),
    statusIdx: index("idx_wh_log_status").on(table.status),
  }),
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDeliveryLog = typeof webhookDeliveryLogs.$inferSelect;

/** 支持的事件类型列表 */
export const WEBHOOK_EVENTS = [
  "user.created",
  "user.deleted",
  "user.updated",
  "recharge.completed",
  "recharge.refunded",
  "withdraw.created",
  "withdraw.completed",
  "agent.commission_settled",
  "alert.triggered",
  "model.price_changed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
