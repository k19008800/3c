// ============================================================
//  3cloud (3C) — 配置版本控制
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// ── 配置版本历史 ──

export const configVersions = pgTable(
  "config_versions",
  {
    id: serial("id").primaryKey(),
    configKey: varchar("config_key", { length: 100 }).notNull(),
    configType: varchar("config_type", { length: 50 }).notNull().default("system"), // system | security | login_security
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    changedBy: integer("changed_by").references(() => users.id),
    changeReason: text("change_reason"),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    configKeyIdx: index("config_versions_key_idx").on(table.configKey),
    configTypeIdx: index("config_versions_type_idx").on(table.configType),
    createdAtIdx: index("config_versions_created_at_idx").on(table.createdAt),
    keyTypeTimeIdx: index("config_versions_key_type_time_idx").on(table.configKey, table.configType, table.createdAt.desc()),
  })
);

// ── 配置快照 ──
// NOTE: 基础表定义已完成，但功能尚未完全集成（TODO）。

export const configSnapshots = pgTable(
  "config_snapshots",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    configType: varchar("config_type", { length: 50 }).notNull(),
    configData: jsonb("config_data").notNull().$type<Record<string, any>>(),
    createdBy: integer("created_by").references(() => users.id),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    configTypeIdx: index("config_snapshots_type_idx").on(table.configType),
    createdByIdx: index("config_snapshots_created_at_idx").on(table.createdAt),
  })
);

// ── 配置变更请求（审批流程）──
// NOTE: 基础表定义已完成，但功能尚未完全集成（TODO）。

export const configChangeRequests = pgTable(
  "config_change_requests",
  {
    id: serial("id").primaryKey(),
    configType: varchar("config_type", { length: 50 }).notNull(),
    changes: jsonb("changes").notNull().$type<Record<string, any>>(),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    requestedBy: integer("requested_by").references(() => users.id),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewComment: text("review_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("ccr_status_idx").on(table.status),
    configTypeIdx: index("ccr_config_type_idx").on(table.configType),
    createdAtIdx: index("ccr_created_at_idx").on(table.createdAt),
  })
);
