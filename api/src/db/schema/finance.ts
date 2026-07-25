// ============================================================
//  3cloud (3C) — 财务 & 成本核算
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  bigint,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { models, vendors, vendorModels } from "./vendors.js";
import { agents } from "./agents.js";
import { campaigns } from "./campaigns.js";
import { rechargeOrders } from "./billing.js";
import { redemptionCodes } from "./redemption.js";

// ══════════════════════════════════════════════════════════════
//  日对账汇总表（预计算 + 缓存）
// ══════════════════════════════════════════════════════════════

export const dailyReconSummary = pgTable(
  "daily_recon_summary",
  {
    id: serial("id").primaryKey(),
    reportDate: varchar("report_date", { length: 10 }).notNull().unique(),
    // 佣金
    commissionCount: integer("commission_count").notNull().default(0),
    commissionTotal: numeric("commission_total", { precision: 18, scale: 6 }).default("0.000000"),
    commissionFee: numeric("commission_fee", { precision: 18, scale: 6 }).default("0.000000"),
    commissionNet: numeric("commission_net", { precision: 18, scale: 6 }).default("0.000000"),
    // 提现
    withdrawCount: integer("withdraw_count").notNull().default(0),
    withdrawTotal: numeric("withdraw_total", { precision: 18, scale: 6 }).default("0.000000"),
    withdrawFee: numeric("withdraw_fee", { precision: 18, scale: 6 }).default("0.000000"),
    withdrawActual: numeric("withdraw_actual", { precision: 18, scale: 6 }).default("0.000000"),
    // 充值
    rechargeCount: integer("recharge_count").notNull().default(0),
    rechargeTotal: numeric("recharge_total", { precision: 18, scale: 6 }).default("0.000000"),
    // 抵扣消耗
    consumptionTotal: numeric("consumption_total", { precision: 18, scale: 6 }).default("0.000000"),
    // 资金平衡校验
    balanceDiff: numeric("balance_diff", { precision: 18, scale: 6 }).default("0.000000"),
    isBalanced: boolean("is_balanced").notNull().default(true),
    // 元数据
    version: integer("version").notNull().default(1),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportDateIdx: uniqueIndex("daily_recon_summary_date_idx").on(table.reportDate),
    balancedIdx: index("daily_recon_summary_balanced_idx").on(table.isBalanced),
  })
);

// ══════════════════════════════════════════════════════════════
//  财务成本核算
// ══════════════════════════════════════════════════════════════

export const financeCostRecords = pgTable(
  "finance_cost_records",
  {
    id: serial("id").primaryKey(),
    costType: varchar("cost_type", { length: 20 }).notNull(),
    period: timestamp("period", { mode: "date", withTimezone: true }).notNull(),
    campaignId: integer("campaign_id").references(() => campaigns.id),
    agentId: integer("agent_id").references(() => agents.id),
    totalFace: bigint("total_face", { mode: "number" }).notNull(),
    totalUsed: bigint("total_used", { mode: "number" }).notNull(),
    costAmount: bigint("cost_amount", { mode: "number" }).notNull(),
    subsidyAmount: bigint("subsidy_amount", { mode: "number" }).notNull(),
    revenueAttributed: bigint("revenue_attributed", { mode: "number" }).notNull().default(0),
    roi: numeric("roi", { precision: 10, scale: 2 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    periodIdx: index("fin_cost_period_idx").on(table.period),
    costTypeIdx: index("fin_cost_type_idx").on(table.costType),
    campaignIdx: index("fin_cost_campaign_idx").on(table.campaignId),
    agentIdx: index("fin_cost_agent_idx").on(table.agentId),
    statusIdx: index("fin_cost_status_idx").on(table.status),
  })
);

// ══════════════════════════════════════════════════════════════
//  利润分析 & 价格管理
// ══════════════════════════════════════════════════════════════

export const financeProfitRecords = pgTable(
  "finance_profit_records",
  {
    id: serial("id").primaryKey(),
    period: varchar("period", { length: 7 }).notNull(),
    vendorModelId: integer("vendor_model_id").references(() => vendorModels.id),
    modelId: integer("model_id").references(() => models.id),
    vendorId: integer("vendor_id").references(() => vendors.id),
    totalCalls: integer("total_calls").notNull().default(0),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    totalUserCost: numeric("total_user_cost", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    totalCostPrice: numeric("total_cost_price", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    grossProfit: numeric("gross_profit", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    grossMargin: numeric("gross_margin", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    totalCommission: numeric("total_commission", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePeriodVm: uniqueIndex("fin_profit_period_vm_idx").on(table.period, table.vendorModelId),
    periodIdx: index("fin_profit_period_idx").on(table.period),
    modelIdx: index("fin_profit_model_idx").on(table.modelId),
    vendorIdx: index("fin_profit_vendor_idx").on(table.vendorId),
  })
);

// ── 价格变更历史 ──

export const priceChangeHistory = pgTable(
  "price_change_history",
  {
    id: serial("id").primaryKey(),
    operatorId: integer("operator_id").notNull().references(() => users.id),
    changeType: varchar("change_type", { length: 20 }).notNull(),
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: integer("target_id"),
    beforeValue: numeric("before_value", { precision: 18, scale: 6 }),
    afterValue: numeric("after_value", { precision: 18, scale: 6 }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: index("pch_target_idx").on(table.targetType, table.targetId),
    createdIdx: index("pch_created_idx").on(table.createdAt.desc()),
  })
);

// ══════════════════════════════════════════════════════════════
//  发票管理
// ══════════════════════════════════════════════════════════════

export const invoiceRequests = pgTable(
  "invoice_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    invoiceType: varchar("invoice_type", { length: 10 }).notNull().default("normal"),
    invoiceTitle: varchar("invoice_title", { length: 255 }).notNull(),
    invoiceTaxId: varchar("invoice_tax_id", { length: 50 }),
    bankName: varchar("bank_name", { length: 255 }),
    bankAccount: varchar("bank_account", { length: 100 }),
    companyAddress: varchar("company_address", { length: 500 }),
    companyPhone: varchar("company_phone", { length: 20 }),
    refOrderId: integer("ref_order_id").references(() => rechargeOrders.id),

    status: varchar("status", { length: 20 }).notNull().default("pending"),

    reviewerId: integer("reviewer_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),

    invoiceNo: varchar("invoice_no", { length: 64 }),
    invoiceFileUrl: varchar("invoice_file_url", { length: 500 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedBy: integer("issued_by").references(() => users.id),

    expressCompany: varchar("express_company", { length: 100 }),
    expressNo: varchar("express_no", { length: 100 }),

    remark: text("remark"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    invUserIdIdx: index("inv_user_idx").on(table.userId),
    invStatusIdx: index("inv_status_idx").on(table.status),
    invCreatedIdx: index("inv_created_idx").on(table.createdAt.desc()),
  })
);

// ══════════════════════════════════════════════════════════════
//  退款管理
// ══════════════════════════════════════════════════════════════

export const refundRequests = pgTable(
  "refund_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    refundType: varchar("refund_type", { length: 20 }).notNull(),
    reason: text("reason").notNull(),
    refCallLogId: integer("ref_call_log_id"),
    refOrderId: integer("ref_order_id").references(() => rechargeOrders.id),

    status: varchar("status", { length: 20 }).notNull().default("pending"),

    reviewerId: integer("reviewer_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    refUserIdIdx: index("ref_user_idx").on(table.userId),
    refStatusIdx: index("ref_status_idx").on(table.status),
  })
);

// ══════════════════════════════════════════════════════════════
//  自动对账报告
// ══════════════════════════════════════════════════════════════

export const reconciliationReports = pgTable(
  "reconciliation_reports",
  {
    id: serial("id").primaryKey(),
    // 时间范围
    startDate: varchar("start_date", { length: 10 }).notNull(),
    endDate: varchar("end_date", { length: 10 }).notNull(),
    // 汇总数据
    totalOrders: integer("total_orders").notNull().default(0),
    matchedOrders: integer("matched_orders").notNull().default(0),
    mismatchedOrders: integer("mismatched_orders").notNull().default(0),
    totalAmount: numeric("total_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    difference: numeric("difference", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    // 对账类型
    reconType: varchar("recon_type", { length: 20 }).notNull().default("full"), // full | recharge | balance | commission
    // 状态
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | running | completed | failed
    // 异常记录（JSON）
    mismatches: jsonb("mismatches").notNull().default([]),
    // 元数据
    createdBy: integer("created_by").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    periodIdx: index("recon_reports_period_idx").on(table.startDate, table.endDate),
    typeIdx: index("recon_reports_type_idx").on(table.reconType),
    statusIdx: index("recon_reports_status_idx").on(table.status),
    createdIdx: index("recon_reports_created_idx").on(table.createdAt.desc()),
  })
);

// ══════════════════════════════════════════════════════════════
//  对账异常明细
// ══════════════════════════════════════════════════════════════

export const reconciliationMismatches = pgTable(
  "reconciliation_mismatches",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull().references(() => reconciliationReports.id, { onDelete: "cascade" }),
    // 关联记录
    orderId: integer("order_id"),
    refType: varchar("ref_type", { length: 50 }).notNull(), // recharge_order | balance_log | commission_log | payment_callback
    refId: integer("ref_id").notNull(),
    // 异常信息
    mismatchType: varchar("mismatch_type", { length: 50 }).notNull(), // status_mismatch | amount_mismatch | missing_record | calculation_error
    expectedValue: numeric("expected_value", { precision: 18, scale: 6 }),
    actualValue: numeric("actual_value", { precision: 18, scale: 6 }),
    reason: text("reason").notNull(),
    severity: varchar("severity", { length: 10 }).notNull().default("medium"), // low | medium | high | critical
    // 处理状态
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: integer("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportIdx: index("recon_mismatch_report_idx").on(table.reportId),
    refIdx: index("recon_mismatch_ref_idx").on(table.refType, table.refId),
    typeIdx: index("recon_mismatch_type_idx").on(table.mismatchType),
    severityIdx: index("recon_mismatch_severity_idx").on(table.severity),
    resolvedIdx: index("recon_mismatch_resolved_idx").on(table.resolved),
  })
);
