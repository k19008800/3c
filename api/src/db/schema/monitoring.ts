import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 告警规则表
 * 对齐 ref-5.4-alert-rules.md
 */
export const monitoringRules = pgTable("monitoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().unique(), // 告警指标类型
  name: text("name").notNull(),
  description: text("description"),
  threshold: doublePrecision("threshold").notNull(),
  severity: text("severity").notNull(), // critical / warning / info
  enabled: boolean("enabled").notNull().default(true),
  duration: integer("duration").default(60), // 持续判定时间（秒）
  silencePeriod: integer("silence_period").default(300), // 静默期（秒）
  escalationEnabled: boolean("escalation_enabled").default(false),
  escalationAfter: integer("escalation_after").default(3600),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 告警事件记录表
 */
export const monitoringAlerts = pgTable("monitoring_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
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
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MonitoringRule = typeof monitoringRules.$inferSelect;
export type MonitoringAlert = typeof monitoringAlerts.$inferSelect;
