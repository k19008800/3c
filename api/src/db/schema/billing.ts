// ============================================================
//  3cloud (3C) — 计费 & 交易
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

import {
  callStatusEnum,
  payChannelEnum,
  orderStatusEnum,
  balanceLogTypeEnum,
} from "./enums.js";
import { users } from "./users.js";
import { apiKeys } from "./api-keys.js";
import { models, vendorModels } from "./vendors.js";

// ── call_logs: PG 原生表分区（PARTITION BY RANGE created_at），按月分区  ──
// Drizzle schema 仅定义父表结构；分区创建由 SQL 迁移执行。

export const callLogs = pgTable(
  "call_logs",
  {
    id: serial("id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    apiKeyId: integer("api_key_id")
      .references(() => apiKeys.id),
    modelId: integer("model_id")
      .references(() => models.id),
    vendorModelId: integer("vendor_model_id")
      .references(() => vendorModels.id),
    vendorName: varchar("vendor_name", { length: 100 }),
    modelName: varchar("model_name", { length: 100 }),

    // 溯源：Key 分组中实际使用的 Key 条目
    keyGroupItemId: integer("key_group_item_id"),
    // 当时生效的 Key 级别售价（可能不同于 vendor_models 的售价）
    keySellPriceInput: numeric("key_sell_price_input", { precision: 18, scale: 6 }),
    keySellPriceOutput: numeric("key_sell_price_output", { precision: 18, scale: 6 }),

    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cost: numeric("cost", { precision: 18, scale: 6 }).notNull().default("0.000000"),

    durationMs: integer("duration_ms"),
    status: callStatusEnum("status").notNull(),
    errorMessage: text("error_message"),

    isStreaming: boolean("is_streaming").notNull().default(false),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // 复合 PK（分区列必须在 PK 中）
    pk: primaryKey({ columns: [table.id, table.createdAt] }),

    // 分区内索引
    userCreatedAtIdx: index("call_logs_user_created_at_idx").on(table.userId, table.createdAt),
    apiKeyCreatedAtIdx: index("call_logs_api_key_created_at_idx").on(table.apiKeyId, table.createdAt),
    vendorCreatedAtIdx: index("call_logs_vendor_created_at_idx").on(table.vendorName, table.createdAt),
    statusCreatedAtIdx: index("call_logs_status_created_at_idx").on(table.status, table.createdAt),
    modelNameCreatedAtIdx: index("call_logs_model_name_created_at_idx").on(table.modelName, table.createdAt.desc()),
    createdAtIdx: index("call_logs_created_at_idx").on(table.createdAt),
  })
);

// ── 充值订单 ──

export const rechargeOrders = pgTable(
  "recharge_orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    orderNo: varchar("order_no", { length: 64 }).notNull().unique(), // 业务订单号
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    channel: payChannelEnum("channel").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    // 在线支付
    channelOrderNo: varchar("channel_order_no", { length: 128 }),   // 微信/支付宝订单号
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // 对公转账
    voucherImage: varchar("voucher_image", { length: 500 }),        // 转账凭证图片
    confirmedBy: integer("confirmed_by").references(() => users.id),// 单次确认兼容
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // 增强财务字段
    voucherNo: varchar("voucher_no", { length: 32 }),
    payerAccountName: varchar("payer_account_name", { length: 128 }),
    payerAccountNo: varchar("payer_account_no", { length: 64 }),
    transferRemark: varchar("transfer_remark", { length: 256 }),
    bankTxId: varchar("bank_tx_id", { length: 64 }),
    bankTxCheckedAt: timestamp("bank_tx_checked_at", { withTimezone: true }),
    // 双审字段
    firstConfirmedBy: integer("first_confirmed_by").references(() => users.id),
    firstConfirmedAt: timestamp("first_confirmed_at", { withTimezone: true }),
    secondConfirmedBy: integer("second_confirmed_by").references(() => users.id),
    secondConfirmedAt: timestamp("second_confirmed_at", { withTimezone: true }),
    // 退款
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    // 过期
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    remark: text("remark"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderNoIdx: uniqueIndex("recharge_orders_order_no_idx").on(table.orderNo),
    userIdIdx: index("recharge_orders_user_id_idx").on(table.userId),
    userIdCreatedAtIdx: index("recharge_orders_user_created_at_idx").on(table.userId, table.createdAt.desc()),
    statusIdx: index("recharge_orders_status_idx").on(table.status),
  })
);

// ── 余额流水 ──

export const balanceLogs = pgTable(
  "balance_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 18, scale: 6 }).notNull(),
    type: balanceLogTypeEnum("type").notNull(),
    refType: varchar("ref_type", { length: 50 }),                   // 关联类型：order / call / adjust
    refId: integer("ref_id"),                                       // 关联 ID
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("balance_logs_user_created_at_idx").on(table.userId, table.createdAt),
    typeIdx: index("balance_logs_type_idx").on(table.type),
  })
);

// ── 用户折扣 ──

export const userDiscounts = pgTable(
  "user_discounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).notNull().default("1.0000"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_discounts_user_id_idx").on(table.userId),
  })
);
