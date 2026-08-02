import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  varchar,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 结算周期定义
 * 对齐 docs/sprint-1/03-settlement-overview.md §2.1
 */
export const settlementCycles = pgTable(
  "settlement_cycles",
  {
    id: serial("id").primaryKey(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePeriod: uniqueIndex("idx_settlement_cycle_period").on(table.periodStart, table.periodEnd),
  }),
);

/**
 * 代理结算账单
 */
export const agentSettlements = pgTable(
  "agent_settlements",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull().references(() => settlementCycles.id),
    agentUserId: integer("agent_user_id").notNull().references(() => users.id),
    totalCommission: numeric("total_commission", { precision: 18, scale: 4 }).notNull().default("0"),
    adjustmentAmount: numeric("adjustment_amount", { precision: 18, scale: 4 }).notNull().default("0"),
    adjustmentReason: text("adjustment_reason"),
    settledAmount: numeric("settled_amount", { precision: 18, scale: 4 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueCycleAgent: uniqueIndex("idx_settlement_cycle_agent").on(table.cycleId, table.agentUserId),
    agentIdx: index("idx_settlement_agent").on(table.agentUserId),
    statusIdx: index("idx_settlement_status").on(table.status),
  }),
);

/**
 * 结算明细
 */
export const settlementDetails = pgTable(
  "settlement_details",
  {
    id: serial("id").primaryKey(),
    settlementId: integer("settlement_id").notNull().references(() => agentSettlements.id, { onDelete: "cascade" }),
    commissionId: integer("commission_id").notNull(),
    amount: numeric("amount", { precision: 18, scale: 8 }).notNull().default("0"),
    clientUserId: integer("client_user_id").notNull().references(() => users.id),
    consumptionId: integer("consumption_id"),
    model: varchar("model", { length: 100 }),
    tokens: integer("tokens").default(0),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    settlementIdx: index("idx_settlement_detail_sid").on(table.settlementId),
  }),
);

/**
 * 对账确认日志
 */
export const settlementConfirmLogs = pgTable(
  "settlement_confirm_logs",
  {
    id: serial("id").primaryKey(),
    settlementId: integer("settlement_id").notNull().references(() => agentSettlements.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 20 }).notNull(),
    operatorId: integer("operator_id").references(() => users.id),
    operatorRole: varchar("operator_role", { length: 20 }).notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    settlementIdx: index("idx_settlement_log_sid").on(table.settlementId),
  }),
);

export type SettlementCycle = typeof settlementCycles.$inferSelect;
export type NewSettlementCycle = typeof settlementCycles.$inferInsert;
export type AgentSettlement = typeof agentSettlements.$inferSelect;
export type NewAgentSettlement = typeof agentSettlements.$inferInsert;
export type SettlementDetail = typeof settlementDetails.$inferSelect;
export type NewSettlementDetail = typeof settlementDetails.$inferInsert;
export type SettlementConfirmLog = typeof settlementConfirmLogs.$inferSelect;
export type NewSettlementConfirmLog = typeof settlementConfirmLogs.$inferInsert;
