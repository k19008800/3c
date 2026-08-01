import {
  pgTable, serial, integer, numeric, varchar, boolean, text, date, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 用户预算设置 对齐 SPEC-§20.1
 * 月度消费预算 / 日预算 / 软硬上限 / 熔断豁免 Key / 预警阈值
 */
export const userBudgetSettings = pgTable(
  "user_budget_settings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    monthlyBudget: numeric("monthly_budget", { precision: 18, scale: 2 }).notNull().default("0"),
    dailyBudget: numeric("daily_budget", { precision: 18, scale: 2 }).notNull().default("0"),
    budgetType: varchar("budget_type", { length: 10 }).notNull().default("hard"), // hard | soft
    alertThresholds: varchar("alert_thresholds", { length: 50 }).notNull().default("80"), // 逗号分隔百分比
    exemptKeys: text("exempt_keys").notNull().default(""), // JSON 数组 [keyId,...]
    autoBlock: boolean("auto_block").notNull().default(true),
    currentMonthSpent: numeric("current_month_spent", { precision: 18, scale: 4 }).notNull().default("0"),
    currentDaySpent: numeric("current_day_spent", { precision: 18, scale: 4 }).notNull().default("0"),
    periodStart: date("period_start"),
    blocked: boolean("blocked").notNull().default(false),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    lastAlertedAt: integer("last_alerted_at"), // 已触发的最高百分比阈值
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uk_user_budget").on(table.userId)],
);

export type UserBudgetSettings = typeof userBudgetSettings.$inferSelect;
export type NewUserBudgetSettings = typeof userBudgetSettings.$inferInsert;

/**
 * 预算预警日志
 */
export const budgetAlertLogs = pgTable(
  "budget_alert_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    budgetSettingsId: integer("budget_settings_id").notNull(),
    threshold: integer("threshold").notNull(),
    currentSpent: numeric("current_spent", { precision: 18, scale: 4 }),
    monthlyBudget: numeric("monthly_budget", { precision: 18, scale: 2 }),
    alertChannel: varchar("alert_channel", { length: 20 }).notNull().default("both"),
    alertedAt: timestamp("alerted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_budget_alert_user").on(table.userId)],
);

/**
 * 熔断日志
 */
export const budgetBlockLogs = pgTable(
  "budget_block_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    budgetSettingsId: integer("budget_settings_id").notNull(),
    action: varchar("action", { length: 20 }).notNull(), // blocked / unblocked / auto_unblocked / raise_budget
    reason: text("reason"),
    operatorId: integer("operator_id"),
    previousMonthlyBudget: numeric("previous_monthly_budget", { precision: 18, scale: 2 }),
    newMonthlyBudget: numeric("new_monthly_budget", { precision: 18, scale: 2 }),
    operatedAt: timestamp("operated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_budget_block_user").on(table.userId)],
);
