import {
  pgTable, serial, varchar, text, boolean, integer, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** 风控规则表 */
export const riskRules = pgTable(
  "risk_rules",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    type: varchar("type", { length: 30 }).notNull().default("ip"), // ip | key | user | behavior
    conditions: jsonb("conditions").notNull().default({}),
    action: varchar("action", { length: 30 }).notNull().default("block"), // block | warn | captcha | throttle
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_risk_rules_type").on(table.type)],
);

/** 安全事件表 */
export const securityEvents = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 50 }).notNull(), // login_fail | api_abuse | suspicious_ip | rate_exceeded
    severity: varchar("severity", { length: 20 }).notNull().default("medium"), // low | medium | high | critical
    userId: integer("user_id").references(() => users.id),
    detail: jsonb("detail").notNull().default({}),
    ip: varchar("ip", { length: 64 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | handling | resolved | ignored
    handledBy: integer("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_se_events_type").on(table.type),
    index("idx_se_events_user").on(table.userId),
    index("idx_se_events_status").on(table.status),
  ],
);

export type RiskRule = typeof riskRules.$inferSelect;
export type NewRiskRule = typeof riskRules.$inferInsert;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;
