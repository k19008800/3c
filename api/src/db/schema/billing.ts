import {
  pgTable,
  bigint,
  integer,
  numeric,
  varchar,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 计费日志表
 * 对齐 ref-5.2-billing.md §5.2
 * ⚠️ 与 call_logs 一致用复合主键 (id, created_at)，按月分区
 *    call_log_id 不做 FK 约束（分区表跨分区 FK 维护成本高，用普通列+索引代替）
 */
export const billingLogs = pgTable(
  "billing_logs",
  {
    id: bigint("id", { mode: "number" }),
    userId: integer("user_id").notNull().references(() => users.id),
    callLogId: bigint("call_log_id", { mode: "number" }),
    // 定价信息
    priceSource: varchar("price_source", { length: 20 }),
    inputPrice: numeric("input_price", { precision: 18, scale: 6 }),
    outputPrice: numeric("output_price", { precision: 18, scale: 6 }),
    discountRate: numeric("discount_rate", { precision: 5, scale: 4 }),
    // 费用（元）
    estimatedCost: numeric("estimated_cost", { precision: 18, scale: 6 }),
    actualCost: numeric("actual_cost", { precision: 18, scale: 6 }),
    refundAmount: numeric("refund_amount", { precision: 18, scale: 6 }),
    // 余额快照（分）
    balanceBefore: integer("balance_before"),
    balanceAfter: integer("balance_after"),
    // 状态
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("idx_billing_call_log").on(table.callLogId),
    index("idx_billing_user_created").on(table.userId, table.createdAt),
  ],
);

export type BillingLog = typeof billingLogs.$inferSelect;
export type NewBillingLog = typeof billingLogs.$inferInsert;
