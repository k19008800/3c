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
import { users } from "./users";

/**
 * 发票表
 * 对齐 ref-9.6-tax-invoice.md + ref-2.2.8-redemption-invoices.md
 * 用户可申请发票（基于已消费金额），财务开票后回填发票号
 * 状态机: pending(待开) → issued(已开) → voided(已作废) / rejected(已驳回)
 * 类型: special(专票) / ordinary(普票)
 */
export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),

    // 发票号（财务开票后生成）
    invoiceNo: varchar("invoice_no", { length: 64 }),

    // 金额（元，不含税）与税额
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("13"),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }),

    // 类型: special(专票) / ordinary(普票)
    type: varchar("type", { length: 20 }).notNull().default("ordinary"),
    // 状态机
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    // 抬头信息
    title: varchar("title", { length: 200 }).notNull(),           // 公司/个人抬头
    taxNo: varchar("tax_no", { length: 50 }),                     // 税号（专票必填）
    address: varchar("address", { length: 200 }),                 // 注册地址（专票）
    bankAccount: varchar("bank_account", { length: 200 }),        // 开户行及账号（专票）
    email: varchar("email", { length: 100 }),                     // 接收电子发票邮箱
    remark: varchar("remark", { length: 500 }),                   // 用户备注

    // 审核/开票
    rejectReason: varchar("reject_reason", { length: 500 }),
    issuedBy: integer("issued_by"),                               // 开票管理员
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_inv_user").on(table.userId),
    index("idx_inv_status").on(table.status),
    index("idx_inv_created").on(table.createdAt),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
