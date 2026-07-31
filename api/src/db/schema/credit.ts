// ============================================================
//  3cloud (3C) — 授信额度与逾期管理（SPEC-§29.6）
//  credit_accounts: 信用额度账户
//  overdue_records: 逾期记录（罚息/分级/减免/催收）
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  date,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// ── 授信额度账户 ──
export const creditAccounts = pgTable(
  "credit_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }).notNull().default("0.00"),
    usedAmount: numeric("used_amount", { precision: 18, scale: 2 }).notNull().default("0.00"),
    availableAmount: numeric("available_amount", { precision: 18, scale: 2 }).notNull().default("0.00"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | suspended | frozen
    interestRateDaily: numeric("interest_rate_daily", { precision: 8, scale: 6 }).notNull().default("0.000500"),
    graceDays: integer("grace_days").notNull().default(7),
    lastBillingDate: date("last_billing_date"),
    nextBillingDate: date("next_billing_date"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("credit_accounts_user_idx").on(table.userId),
    statusIdx: index("credit_accounts_status_idx").on(table.status),
  })
);

// ── 逾期记录 ──
export const overdueRecords = pgTable(
  "overdue_records",
  {
    id: serial("id").primaryKey(),
    creditAccountId: integer("credit_account_id").notNull().references(() => creditAccounts.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    overdueDays: integer("overdue_days").notNull().default(0),
    overdueAmount: numeric("overdue_amount", { precision: 18, scale: 2 }).notNull().default("0.00"),
    penaltyAmount: numeric("penalty_amount", { precision: 18, scale: 2 }).notNull().default("0.00"),
    stage: varchar("stage", { length: 20 }).notNull().default("reminding"),
    // reminding(1-7天) | collecting(8-15天) | suspended(16-30天) | frozen(>30天)
    waived: boolean("waived").notNull().default(false),
    waivedBy: integer("waived_by").references(() => users.id),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedNote: text("waived_note"),
    notifySentAt: timestamp("notify_sent_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    // open | resolved
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("overdue_records_user_idx").on(table.userId),
    stageIdx: index("overdue_records_stage_idx").on(table.stage),
    statusIdx: index("overdue_records_status_idx").on(table.status),
  })
);
