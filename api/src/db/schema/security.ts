// ============================================================
//  3cloud (3C) — 安全风控
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import {
  riskLevelEnum,
  securityEventTypeEnum,
  circuitStateEnum,
} from "./enums.js";
import { users } from "./users.js";
import { vendorModels } from "./vendors.js";

// ── 登录安全配置 ──

export const loginSecurityConfigs = pgTable(
  "login_security_configs",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(),
    value: jsonb("value").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("login_security_configs_key_idx").on(table.key),
  })
);

// ── 安全事件 ──

export const securityEvents = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: securityEventTypeEnum("event_type").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    detail: jsonb("detail"),
    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("security_events_user_id_idx").on(table.userId),
    typeIdx: index("security_events_type_idx").on(table.eventType),
    createdAtIdx: index("security_events_created_at_idx").on(table.createdAt),
    riskIdx: index("security_events_risk_idx").on(table.riskLevel),
    unacknowledgedIdx: index("security_events_unack_idx").on(table.acknowledged),
  })
);

// ── 用户登录会话 ──

export const userLoginSessions = pgTable(
  "user_login_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
    ip: varchar("ip", { length: 45 }).notNull(),
    userAgent: varchar("user_agent", { length: 500 }),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    lastActivity: timestamp("last_activity", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(table.sessionToken),
    activeSessionIdx: index("sessions_active_idx").on(table.userId, table.isActive),
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
  })
);

// ── 安全自动处置规则 ──

export const securityAutoRules = pgTable(
  "security_auto_rules",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    // 条件：在 timeWindowSeconds 内触发 countThreshold 次
    countThreshold: integer("count_threshold").notNull().default(5),
    timeWindowSeconds: integer("time_window_seconds").notNull().default(300),
    // 动作：ban_ip | ban_user | notify_admin | limit_login
    action: varchar("action", { length: 50 }).notNull().default("notify_admin"),
    // 动作参数（如封禁时长秒数）
    actionParams: jsonb("action_params").default({}),
    // 是否启用
    enabled: boolean("enabled").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id),
    updatedBy: integer("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventTypeIdx: index("auto_rules_event_type_idx").on(table.eventType),
    enabledIdx: index("auto_rules_enabled_idx").on(table.enabled),
  })
);

// ── 熔断历史记录 ──

export const circuitHistory = pgTable(
  "circuit_history",
  {
    id: serial("id").primaryKey(),
    vendorModelId: integer("vendor_model_id")
      .notNull()
      .references(() => vendorModels.id, { onDelete: "cascade" }),
    fromState: circuitStateEnum("from_state"),
    toState: circuitStateEnum("to_state").notNull(),
    reason: text("reason"),
    failCount: integer("fail_count").default(0),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vendorModelIdIdx: index("circuit_history_vm_id_idx").on(table.vendorModelId),
    createdAtIdx: index("circuit_history_created_at_idx").on(table.createdAt),
  })
);
