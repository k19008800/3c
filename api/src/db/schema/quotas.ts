// ============================================================
//  3cloud (3C) — 用户额度预算表
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import {
  quotaTypeEnum,
  setByRoleEnum,
} from "./enums.js";
import { users } from "./users.js";
import { apiKeys } from "./api-keys.js";

/**
 * 用户月度/总额度预算
 * 支持按月重置（monthly）、永久限额（total）、按 Key 控制（per_key）
 */
export const userQuotas = pgTable(
  "user_quotas",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quotaType: quotaTypeEnum("quota_type").notNull().default("monthly"),
    quotaAmount: numeric("quota_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    usedAmount: numeric("used_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    alertPercent: numeric("alert_percent", { precision: 5, scale: 2 }).notNull().default("80.00"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    setBy: integer("set_by")
      .references(() => users.id),
    setByRole: setByRoleEnum("set_by_role").notNull().default("admin"),
    reason: text("reason"),
    rpmLimit: integer("rpm_limit"),    // 用户级 RPM 上限（额度级覆盖）
    tpmLimit: integer("tpm_limit"),    // 用户级 TPM 上限（额度级覆盖）
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_quotas_user_id_idx").on(table.userId),
    userIdTypePeriodIdx: index("user_quotas_user_type_period_idx").on(table.userId, table.quotaType, table.periodStart),
    activeIdx: index("user_quotas_active_idx").on(table.userId, table.quotaType, table.periodEnd),
  })
);

/**
 * Key 级额度
 */
export const keyQuotas = pgTable(
  "key_quotas",
  {
    id: serial("id").primaryKey(),
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    quotaAmount: numeric("quota_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    usedAmount: numeric("used_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    alertPercent: numeric("alert_percent", { precision: 5, scale: 2 }).notNull().default("80.00"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    apiKeyIdIdx: uniqueIndex("key_quotas_api_key_id_idx").on(table.apiKeyId),
  })
);
