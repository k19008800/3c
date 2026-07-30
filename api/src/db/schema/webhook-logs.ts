// ============================================================
//  3cloud (3C) — Webhook 事件投递日志表
//  webhook_event_logs 表定义
// ============================================================

import { pgTable, serial, integer, varchar, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { globalWebhooks } from "./webhooks.js";

export const webhookEventLogs = pgTable("webhook_event_logs", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => globalWebhooks.id, { onDelete: "cascade" }),
  event: varchar("event", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  statusCode: integer("status_code"),
  requestBody: jsonb("request_body"),
  responseBody: text("response_body"),
  attempt: integer("attempt").notNull().default(1),
  maxRetries: integer("max_retries").notNull().default(3),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  retriedAt: timestamp("retried_at"),
});