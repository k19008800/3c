// ============================================================
//  3cloud (3C) — 代理商结算周期与对账
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { agents } from "./agents.js";
import { commissionLogs } from "./agents.js";
import { consumptionLogs } from "./billing.js";

// ── 结算周期定义 ──

export const settlementCycles = pgTable(
  "settlement_cycles",
  {
    id: serial("id").primaryKey(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    // open / closed / settled
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    periodIdx: uniqueIndex("sc_period_idx").on(table.periodStart, table.periodEnd),
  })
);

// ── 代理结算账单 ──

export const agentSettlements = pgTable(
  "agent_settlements",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => settlementCycles.id),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id),
    totalCommission: numeric("total_commission", { precision: 18, scale: 4 }).notNull().default("0.0000"),
    settledAmount: numeric("settled_amount", { precision: 18, scale: 4 }).notNull().default("0.0000"),
    adjustmentAmount: numeric("adjustment_amount", { precision: 18, scale: 4 }).notNull().default("0.0000"),
    adjustmentReason: text("adjustment_reason"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending / confirmed / auto_confirmed / settled
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentCycleIdx: uniqueIndex("as_agent_cycle_idx").on(table.cycleId, table.agentId),
    agentIdIdx: index("as_agent_id_idx").on(table.agentId),
    statusIdx: index("as_status_idx").on(table.status),
  })
);

// ── 结算明细 ──

export const settlementDetails = pgTable(
  "settlement_details",
  {
    id: serial("id").primaryKey(),
    settlementId: integer("settlement_id")
      .notNull()
      .references(() => agentSettlements.id, { onDelete: "cascade" }),
    commissionId: integer("commission_id").notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    clientUserId: integer("client_user_id")
      .notNull()
      .references(() => users.id),
    consumptionId: integer("consumption_id"),
    model: varchar("model", { length: 100 }),
    tokens: integer("tokens"),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    settlementIdx: index("sd_settlement_idx").on(table.settlementId),
    clientIdx: index("sd_client_idx").on(table.clientUserId),
  })
);

// ── 对账确认日志 ──

export const settlementConfirmLogs = pgTable(
  "settlement_confirm_logs",
  {
    id: serial("id").primaryKey(),
    settlementId: integer("settlement_id")
      .notNull()
      .references(() => agentSettlements.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 20 }).notNull(),
    // generate / confirm / auto_confirm / adjust / settle
    operatorId: integer("operator_id").references(() => users.id),
    operatorRole: varchar("operator_role", { length: 20 }),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    settlementIdx: index("scl_settlement_idx").on(table.settlementId),
  })
);
