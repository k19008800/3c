import { pgTable, serial, integer, numeric, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * 对账差异表
 * 对齐 SPEC-§29.3：集中记录自动对账发现的平台 vs 供应商 / 平台 vs 代理商差异
 *
 * subjectType: 'vendor' | 'agent'
 * status: pending(待处理) / resolved_platform / resolved_vendor / verify(待核实) / closed(已关闭)
 */
export const reconciliationDifferences = pgTable(
  "reconciliation_differences",
  {
    id: serial("id").primaryKey(),
    subjectType: varchar("subject_type", { length: 10 }).notNull(), // vendor | agent
    subjectId: integer("subject_id").notNull(), // vendor_id 或 agent_id
    period: varchar("period", { length: 10 }).notNull(), // YYYY-MM-DD 或 YYYY-MM
    platformAmount: numeric("platform_amount", { precision: 18, scale: 4 }).notNull().default("0"), // 平台记录
    counterpartyAmount: numeric("counterparty_amount", { precision: 18, scale: 4 }).notNull().default("0"), // 对方账单
    diffAmount: numeric("diff_amount", { precision: 18, scale: 4 }).notNull().default("0"), // 差异 = 对方 - 平台
    checkType: varchar("check_type", { length: 30 }).notNull().default("settlement"), // 对账维度
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    resolveMode: varchar("resolve_mode", { length: 20 }), // platform / counterparty / verify
    remark: text("remark"),
    resolvedBy: integer("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rd_status").on(table.status),
    index("idx_rd_subject").on(table.subjectType, table.subjectId),
  ],
);

export type ReconciliationDifference = typeof reconciliationDifferences.$inferSelect;
export type NewReconciliationDifference = typeof reconciliationDifferences.$inferInsert;

export const DIFF_STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  resolved_platform: "以平台为准",
  resolved_counterparty: "以对方为准",
  verify: "待核实",
  closed: "已关闭",
};
