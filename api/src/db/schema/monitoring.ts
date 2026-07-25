// ============================================================
//  3cloud (3C) — 监控告警 Schema
//  monitoring_alerts — 告警记录
//  monitoring_rules  — 告警规则
//  notification_config — 通知配置
//  notification_history — 通知历史
// ============================================================

import { pgTable, uuid, text, timestamp, boolean, doublePrecision, jsonb, integer } from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────
//  monitoring_alerts — 告警记录表
// ──────────────────────────────────────────────

export const monitoringAlerts = pgTable("monitoring_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // api_response_time | api_error_rate | database_connection | redis_health | disk_usage | memory_usage
  severity: text("severity").notNull(), // critical | warning | info
  message: text("message").notNull(),
  value: doublePrecision("value").notNull(),
  threshold: doublePrecision("threshold").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  escalated: boolean("escalated").notNull().default(false),
  escalationLevel: integer("escalation_level").default(0),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"),
  metadata: jsonb("metadata"), // 额外信息
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────
//  monitoring_rules — 告警规则表
// ──────────────────────────────────────────────

export const monitoringRules = pgTable("monitoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().unique(), // api_response_time | api_error_rate | database_connection | redis_health | disk_usage | memory_usage
  name: text("name").notNull(), // 规则名称
  description: text("description"),
  threshold: doublePrecision("threshold").notNull(),
  severity: text("severity").notNull(), // critical | warning | info
  enabled: boolean("enabled").notNull().default(true),
  duration: integer("duration").default(60), // 持续时间（秒）
  silencePeriod: integer("silence_period").default(300), // 静默期（秒）
  escalationEnabled: boolean("escalation_enabled").default(false),
  escalationAfter: integer("escalation_after").default(3600), // 升级时间（秒）
  metadata: jsonb("metadata"), // 额外配置
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────
//  notification_config — 通知配置表
// ──────────────────────────────────────────────

export const notificationConfig = pgTable("notification_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  emailRecipients: jsonb("email_recipients").$type<string[]>(),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url"),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  smsPhoneNumbers: jsonb("sms_phone_numbers").$type<string[]>(),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  pushTokens: jsonb("push_tokens").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────
//  notification_history — 通知历史表
// ──────────────────────────────────────────────

export const notificationHistory = pgTable("notification_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").references(() => monitoringAlerts.id),
  channel: text("channel").notNull(), // email | webhook | sms | push
  recipient: text("recipient").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(), // sent | failed | pending
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
