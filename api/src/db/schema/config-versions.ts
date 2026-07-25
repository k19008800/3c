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
