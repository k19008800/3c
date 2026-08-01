import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * 平台总账（资金流水表）
 * 对齐 SPEC-§29.1：记录每一笔资金的进出明细
 *
 * type 枚举：
 *   user_recharge      收入 用户充值到平台
 *   user_consumption   收入 用户 API 调用消费（平台收入）
 *   user_refund        支出 平台退款给用户
 *   user_recharge_refund 支出 充值未到账补退
 *   agent_commission   支出 代理商佣金结算
 *   agent_withdraw     支出 代理商提现
 *   vendor_settlement  支出 结算给供应商
 *   internal_adjust    ±    内部调账（人工操作）
 *   platform_fee       支出 平台运营支出（短信/服务器等）
 *   credit_repayment   收入 信用额度还款
 *
 * direction: 'in' | 'out'
 * status: completed / pending / failed / reversed
 */
export const platformLedger = pgTable(
  "platform_ledger",
  {
    id: serial("id").primaryKey(),
    serialNo: varchar("serial_no", { length: 40 }).notNull().unique(), // FL20260728-0001
    type: varchar("type", { length: 50 }).notNull(),
    direction: varchar("direction", { length: 10 }).notNull(), // 'in' | 'out'
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 18, scale: 4 }).notNull(),
    userId: integer("user_id"),
    agentId: integer("agent_id"),
    vendorId: integer("vendor_id"),
    relatedOrderNo: varchar("related_order_no", { length: 64 }), // 关联业务单号
    externalRef: varchar("external_ref", { length: 128 }), // 外部支付单号
    paymentChannel: varchar("payment_channel", { length: 30 }), // wechat / alipay / bank / balance
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    remark: text("remark"),
    operatorId: integer("operator_id"), // 操作人（人工操作时记录）
    reversedBySerial: varchar("reversed_by_serial", { length: 40 }), // 冲正关联
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ledger_type").on(table.type),
    index("idx_ledger_user").on(table.userId),
    index("idx_ledger_vendor").on(table.vendorId),
    index("idx_ledger_created").on(table.createdAt),
  ],
);

export type PlatformLedger = typeof platformLedger.$inferSelect;
export type NewPlatformLedger = typeof platformLedger.$inferInsert;

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  user_recharge: "用户充值",
  user_consumption: "用户消费",
  user_refund: "平台退款",
  user_recharge_refund: "充值补退",
  agent_commission: "代理佣金",
  agent_withdraw: "代理提现",
  vendor_settlement: "供应商结算",
  internal_adjust: "内部调账",
  platform_fee: "平台支出",
  credit_repayment: "信用还款",
};

export const LEDGER_DIRECTION: Record<string, "in" | "out"> = {
  user_recharge: "in",
  user_consumption: "in",
  user_refund: "out",
  user_recharge_refund: "out",
  agent_commission: "out",
  agent_withdraw: "out",
  vendor_settlement: "out",
  internal_adjust: "in", // 方向由调用方指定，默认 in（可 ±）
  platform_fee: "out",
  credit_repayment: "in",
};
