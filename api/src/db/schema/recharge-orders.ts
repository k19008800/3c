import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 充值订单表
 * 对齐 SPEC-充值中心.md §四
 * 状态机: pending → (success | failed | expired | bank_pending → under_review → success | rejected)
 */
export const rechargeOrders = pgTable(
  "recharge_orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),

    // 订单标识
    orderId: varchar("order_id", { length: 64 }).notNull().unique(),

    // 金额（元，保留两位小数）
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    payAmount: numeric("pay_amount", { precision: 18, scale: 2 }), // 实际支付（含优惠减免）
    actualAmount: numeric("actual_amount", { precision: 18, scale: 2 }), // 实际到账（含赠送）

    // 支付信息
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
    tradeNo: varchar("trade_no", { length: 128 }), // 支付网关交易号
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    // 优惠
    promotionId: integer("promotion_id"),
    freeAmount: numeric("free_amount", { precision: 18, scale: 2 }),

    // 对公转账
    voucherPath: varchar("voucher_path", { length: 255 }),
    reviewNote: varchar("review_note", { length: 500 }),

    // 时间戳
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_recharge_user_id").on(table.userId),
    index("idx_recharge_status").on(table.status),
  ],
);

export type RechargeOrder = typeof rechargeOrders.$inferSelect;
export type NewRechargeOrder = typeof rechargeOrders.$inferInsert;
