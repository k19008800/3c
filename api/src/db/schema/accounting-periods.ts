import { pgTable, serial, varchar, pgEnum, timestamp, numeric, integer, text, index } from 'drizzle-orm/pg-core';

export const accountingPeriodStatusEnum = pgEnum('accounting_period_status', [
  'open',
  'locked',
  'unlocked',
]);

export const accountingPeriods = pgTable(
  'accounting_periods',
  {
    id: serial('id').primaryKey(),
    period: varchar('period', { length: 7 }).notNull().unique(),
    status: accountingPeriodStatusEnum('status').notNull().default('open'),
    incomeTotal: numeric('income_total', { precision: 18, scale: 4 }).notNull().default('0'),
    expenseTotal: numeric('expense_total', { precision: 18, scale: 4 }).notNull().default('0'),
    grossProfit: numeric('gross_profit', { precision: 18, scale: 4 }).notNull().default('0'),
    grossMargin: numeric('gross_margin', { precision: 18, scale: 4 }).notNull().default('0'),
    lockedBy: integer('locked_by'),
    lockedAt: timestamp('locked_at'),
    unlockedBy: integer('unlocked_by'),
    unlockedReason: text('unlocked_reason'),
    unlockedAt: timestamp('unlocked_at'),
    relockAt: timestamp('relock_at'),
    voucherNo: varchar('voucher_no', { length: 40 }),
    checkSummary: text('check_summary'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_ap_status').on(t.status)],
);
