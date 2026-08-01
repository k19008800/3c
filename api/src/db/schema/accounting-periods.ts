import { pgTable, serial, integer, numeric, varchar, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * 会计期间 / 财务锁账表
 * 对齐 SPEC-§29.4：每月财务结账时锁定该月数据，生成结转凭证
 *
 * status: open(未结账) / locked(已锁账) / unlocked(临时解锁中)
 * 临时解锁 1 小时后自动重新锁定
 */
export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: serial("id").primaryKey(),
    period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
    status: varchar("status", { length: 20 }).notNull().default("open"), // open / locked / unlocked
    incomeTotal: numeric("income_total", { precision: 18, scale: 4 }).notNull().default("0"),
    expenseTotal: numeric("expense_total", { precision: 18, scale: 4 }).notNull().default("0"),
    grossProfit: numeric("gross_profit", { precision: 18, scale: 4 }).notNull().default("0"),
    grossMargin: numeric("gross_margin", { precision: 18, scale: 4 }).notNull().default("0"), // 毛利率
    lockedBy: integer("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    // 临时解锁
    unlockedBy: integer("unlocked_by"),
    unlockedReason: text("unlocked_reason"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    relockAt: timestamp("relock_at", { withTimezone: true }), // 临时解锁自动重锁时间
    // 结转凭证摘要
    voucherNo: varchar("voucher_no", { length: 40 }),
    checkSummary: text("check_summary"), // 前置检查结果 JSON
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uk_ap_period").on(table.period), index("idx_ap_status").on(table.status)],
);

export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type NewAccountingPeriod = typeof accountingPeriods.$inferInsert;

export const PERIOD_STATUS_LABEL: Record<string, string> = {
  open: "未结账",
  locked: "已锁账",
  unlocked: "临时解锁中",
};
