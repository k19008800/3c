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
 * 余额变动日志表
 * 记录用户的每一笔余额变动：充值、消费、退款、管理员调整、赠送
 */
export const balanceLogs = pgTable(
  "balance_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),

    // 变动类型
    type: varchar("type", { length: 20 }).notNull(),
    // 'recharge' | 'consumption' | 'refund' | 'adjustment' | 'promotion' | 'manual_fix'

    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    // 正数=增加，负数=减少

    balanceBefore: numeric("balance_before", { precision: 18, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),

    // 关联订单（可选）
    orderId: varchar("order_id", { length: 64 }),

    // 关联充值订单
    rechargeOrderId: integer("recharge_order_id"),

    // 描述
    description: varchar("description", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_bl_user_id").on(table.userId),
    index("idx_bl_type").on(table.type),
    index("idx_bl_created").on(table.createdAt),
  ],
);

export type BalanceLog = typeof balanceLogs.$inferSelect;
export type NewBalanceLog = typeof balanceLogs.$inferInsert;
