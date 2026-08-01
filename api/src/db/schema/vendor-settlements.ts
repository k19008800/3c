import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  bigint,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { vendors } from "./vendors";

/**
 * 供应商结算单表
 * 对齐 ref-4.15-vendor-settlement.md + ref-4.10 §4.3
 * 按月度周期为供应商生成结算单：聚合该供应商的调用量/成本，计算平台佣金与应结算金额
 * 状态机: pending(待结算) → generated(已生成) → confirmed(已确认) → paid(已打款)
 *                                              \→ disputed(争议中) → confirmed
 */
export const vendorSettlements = pgTable(
  "vendor_settlements",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().references(() => vendors.id),
    period: varchar("period", { length: 7 }).notNull(), // YYYY-MM

    // 汇总
    totalCalls: integer("total_calls").notNull().default(0),
    successCalls: integer("success_calls").notNull().default(0),
    failedCalls: integer("failed_calls").notNull().default(0),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
    totalCost: numeric("total_cost", { precision: 18, scale: 4 }).notNull().default("0"),      // 平台成本
    userRevenue: numeric("user_revenue", { precision: 18, scale: 4 }).notNull().default("0"),   // 用户消费(平台收入)
    commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }).notNull().default("0"), // 平台佣金率
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 4 }).notNull().default("0"),
    settlementAmount: numeric("settlement_amount", { precision: 18, scale: 4 }).notNull().default("0"), // 应结算给供应商 = userRevenue - commission

    // 状态机: pending/generated/confirmed/disputed/paid
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    disputeReason: text("dispute_reason"),

    // 时间戳
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: integer("confirmed_by"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: integer("paid_by"),
    paymentReference: varchar("payment_reference", { length: 128 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uk_vset_vendor_period").on(table.vendorId, table.period),
    index("idx_vset_status").on(table.status),
    index("idx_vset_vendor").on(table.vendorId),
  ],
);

export type VendorSettlement = typeof vendorSettlements.$inferSelect;
export type NewVendorSettlement = typeof vendorSettlements.$inferInsert;

export const SETTLEMENT_STATUS: Record<string, string> = {
  pending: "待结算",
  generated: "已生成",
  confirmed: "已确认",
  disputed: "争议中",
  paid: "已打款",
};
