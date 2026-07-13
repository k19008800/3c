// ============================================================
//  3cloud (3C) — 代理商系统
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
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  commissionStatusEnum,
  withdrawStatusEnum,
} from "./enums.js";
import { users } from "./users.js";
import { redemptionCodes } from "./redemption.js";

// ── 代理商 ──

export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    totalCommission: numeric("total_commission", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    settledCommission: numeric("settled_commission", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    pendingWithdraw: numeric("pending_withdraw", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    frozenAmount: numeric("frozen_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    redemptionLocked: numeric("redemption_locked", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    // 结算周期配置 (V3.6)
    settlementCycle: varchar("settlement_cycle", { length: 10 }).notNull().default("manual"),
    nextSettlementAt: timestamp("next_settlement_at", { withTimezone: true }),
    lastSettlementAt: timestamp("last_settlement_at", { withTimezone: true }),
    minWithdrawAmount: numeric("min_withdraw_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    status: boolean("status").notNull().default(true),
    // 团队层级
    parentAgentId: integer("parent_agent_id").references((): AnyPgColumn => agents.id),
    teamDepth: integer("team_depth").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("agents_user_id_idx").on(table.userId),
    parentIdx: index("agents_parent_idx").on(table.parentAgentId),
  })
);

// ── 代理商客户关系 ──

export const agentClients = pgTable(
  "agent_clients",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    clientUserId: integer("client_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("agent_clients_agent_id_idx").on(table.agentId),
    clientIdx: uniqueIndex("agent_clients_client_idx").on(table.clientUserId),
  })
);

// ── 佣金日志 ──

export const commissionLogs = pgTable(
  "commission_logs",
  {
    id: serial("id").notNull(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    clientCallLogId: integer("client_call_log_id"),
    // 注：client_call_log_id 无 FK 约束，因为 call_logs 是分区表且 PK 为 (id, created_at)。
    // 引用完整性由应用层确保。
    callCost: numeric("call_cost", { precision: 18, scale: 6 }).notNull(),
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 6 }).notNull(),
    status: commissionStatusEnum("status").notNull().default("pending"),
    // 增强字段
    voucherNo: varchar("voucher_no", { length: 32 }),
    commissionType: varchar("commission_type", { length: 20 }), // 'sale'|'team'|'activity'|'renewal'
    sourceOrderId: varchar("source_order_id", { length: 64 }),
    sourceOrderAmount: numeric("source_order_amount", { precision: 18, scale: 6 }),
    sourceCustomerId: integer("source_customer_id").references(() => users.id, { onDelete: "set null" }),
    feeRate: numeric("fee_rate", { precision: 5, scale: 4 }).default("0.0000"),
    feeAmount: numeric("fee_amount", { precision: 18, scale: 6 }).default("0.000000"),
    netAmount: numeric("net_amount", { precision: 18, scale: 6 }),
    ruleSnapshot: jsonb("rule_snapshot"),
    calcDetail: jsonb("calc_detail"),
    balanceSnapshot: numeric("balance_snapshot", { precision: 18, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    agentIdCreatedAtIdx: index("commission_logs_agent_id_created_at_idx").on(table.agentId, table.createdAt.desc()),
    statusCreatedAtIdx: index("commission_logs_status_created_at_idx").on(table.status, table.createdAt.desc()),
    agentIdStatusCreatedAtIdx: index("commission_logs_agent_status_date_idx").on(table.agentId, table.status, table.createdAt.desc()),
    voucherNoIdx: index("commission_logs_voucher_no_idx").on(table.voucherNo),
  })
);

// ── 客户消费汇总 ──

export const agentCustomerConsumption = pgTable(
  "agent_customer_consumption",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    customerUserId: integer("customer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    customerName: varchar("customer_name", { length: 128 }),
    bindAt: timestamp("bind_at", { withTimezone: true }),
    totalAmount: numeric("total_amount", { precision: 18, scale: 6 }).default("0.000000"),
    monthAmount: numeric("month_amount", { precision: 18, scale: 6 }).default("0.000000"),
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 6 }).default("0.000000"),
    orderCount: integer("order_count").default(0),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentCustomerIdx: uniqueIndex("agent_consumption_agent_customer_idx").on(table.agentId, table.customerUserId),
    agentIdIdx: index("agent_consumption_agent_id_idx").on(table.agentId),
  })
);

// ── 佣金规则配置 ──

export const commissionRules = pgTable(
  "commission_rules",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    ruleType: varchar("rule_type", { length: 20 }).notNull(),
    // 'sale' | 'renewal' | 'team' | 'activity'

    rate: numeric("rate", { precision: 5, scale: 4 }).notNull().default("0.0000"),
    isEnabled: boolean("is_enabled").notNull().default(true),

    // 条件约束
    minTriggerAmount: numeric("min_trigger_amount", { precision: 18, scale: 6 }),
    maxCap: numeric("max_cap", { precision: 18, scale: 6 }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),

    // 活动专有
    activityName: varchar("activity_name", { length: 255 }),
    activityType: varchar("activity_type", { length: 50 }),
    fixedAmount: numeric("fixed_amount", { precision: 18, scale: 6 }),

    // 团队专有
    teamLevelLimit: integer("team_level_limit").default(1),

    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentTypeIdx: uniqueIndex("commission_rules_agent_type_idx").on(table.agentId, table.ruleType),
  })
);

// ── 佣金日汇总 ──

export const commissionDailyRollup = pgTable(
  "commission_daily_rollup",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    reportDate: varchar("report_date", { length: 10 }).notNull(),

    // 汇总
    totalRecords: integer("total_records").notNull().default(0),
    totalCallCost: numeric("total_call_cost", { precision: 18, scale: 6 }).default("0.000000"),
    totalCommissionAmount: numeric("total_commission_amount", { precision: 18, scale: 6 }).default("0.000000"),
    totalFeeAmount: numeric("total_fee_amount", { precision: 18, scale: 6 }).default("0.000000"),
    totalNetAmount: numeric("total_net_amount", { precision: 18, scale: 6 }).default("0.000000"),

    // 按状态拆分
    pendingCount: integer("pending_count").default(0),
    settledCount: integer("settled_count").default(0),
    cancelledCount: integer("cancelled_count").default(0),
    pendingAmount: numeric("pending_amount", { precision: 18, scale: 6 }).default("0.000000"),
    settledAmount: numeric("settled_amount", { precision: 18, scale: 6 }).default("0.000000"),
    cancelledAmount: numeric("cancelled_amount", { precision: 18, scale: 6 }).default("0.000000"),

    // 按类型拆分
    saleCount: integer("sale_count").default(0),
    renewalCount: integer("renewal_count").default(0),
    activityCount: integer("activity_count").default(0),
    saleAmount: numeric("sale_amount", { precision: 18, scale: 6 }).default("0.000000"),
    renewalAmount: numeric("renewal_amount", { precision: 18, scale: 6 }).default("0.000000"),
    activityAmount: numeric("activity_amount", { precision: 18, scale: 6 }).default("0.000000"),

    // 代理商业绩快照
    agentTotalCommission: numeric("agent_total_commission", { precision: 18, scale: 6 }).default("0.000000"),
    agentSettledCommission: numeric("agent_settled_commission", { precision: 18, scale: 6 }).default("0.000000"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentDateIdx: uniqueIndex("comm_rollup_agent_date_idx").on(table.agentId, table.reportDate),
    dateIdx: index("comm_rollup_date_idx").on(table.reportDate),
  })
);

// ── 提现订单 ──

export const withdrawOrders = pgTable(
  "withdraw_orders",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    wechatPayNo: varchar("wechat_pay_no", { length: 128 }),          // 微信企业付款单号
    status: withdrawStatusEnum("status").notNull().default("pending_first_review"),
    // 增强财务字段
    voucherNo: varchar("voucher_no", { length: 32 }),
    feeAmount: numeric("fee_amount", { precision: 18, scale: 6 }).default("0.000000"),
    actualAmount: numeric("actual_amount", { precision: 18, scale: 6 }), // 实际到账 = amount - fee_amount
    bankCardNo: varchar("bank_card_no", { length: 64 }),
    bankName: varchar("bank_name", { length: 128 }),
    bankVoucherUrl: varchar("bank_voucher_url", { length: 512 }),
    riskCheckResult: jsonb("risk_check_result"),
    auditLevel: integer("audit_level"),
    // 双审字段
    firstAuditorId: integer("first_auditor_id").references(() => users.id),
    firstAuditedAt: timestamp("first_audited_at", { withTimezone: true }),
    secondAuditorId: integer("second_auditor_id").references(() => users.id),
    secondAuditedAt: timestamp("second_audited_at", { withTimezone: true }),
    paidOperatorId: integer("paid_operator_id").references(() => users.id),
    matchedBankTxId: integer("matched_bank_tx_id"),
    reviewedBy: integer("reviewed_by").references(() => users.id),  // 兼容保留
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("withdraw_orders_agent_id_idx").on(table.agentId),
    statusIdx: index("withdraw_orders_status_idx").on(table.status),
    voucherNoIdx: index("withdraw_orders_voucher_no_idx").on(table.voucherNo),
  })
);

// ── 代理商余额台账 ──

export const agentBalanceLedger = pgTable(
  "agent_balance_ledger",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id),
    balanceType: varchar("balance_type", { length: 20 }).notNull(),
    changeType: varchar("change_type", { length: 30 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    balanceBefore: bigint("balance_before", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    refType: varchar("ref_type", { length: 20 }),
    refId: integer("ref_id"),
    refCodeId: integer("ref_code_id").references(() => redemptionCodes.id),
    remark: text("remark"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("abl_agent_idx").on(table.agentId),
    agentCreatedIdx: index("abl_agent_created_idx").on(table.agentId, table.createdAt),
    balanceTypeIdx: index("abl_balance_type_idx").on(table.balanceType),
    refCodeIdx: index("abl_ref_code_idx").on(table.refCodeId),
  })
);
