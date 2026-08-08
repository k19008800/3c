import {
  pgTable, serial, varchar, integer, boolean, timestamp, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** 余额预警规则 */
export const balanceAlertRules = pgTable(
  "balance_alert_rules",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    userId: integer("user_id").references(() => users.id), // null = 全局规则
    thresholdPercent: integer("threshold_percent").notNull().default(80), // 触发百分比阈值
    channel: varchar("channel", { length: 20 }).notNull().default("both"), // email | sms | both
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_bar_user").on(table.userId)],
);

export type BalanceAlertRule = typeof balanceAlertRules.$inferSelect;
export type NewBalanceAlertRule = typeof balanceAlertRules.$inferInsert;
