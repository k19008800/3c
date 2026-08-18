import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text } from 'drizzle-orm/pg-core';

/**
 * 发票申请/开具表 — 邮件交付模式（产品裁决 2026-08-15）
 *
 * 流程：用户提交申请（status=pending，含收件邮箱 email 与开票信息）
 *   → 财务在后台审核：开票（issue，生成 invoice_no）或驳回（reject，填原因）
 *   → 开票后财务点击「发送发票邮件」→ 系统经 SMTP 发送电子发票到收件邮箱
 *     （email_sent_at 记录发送时间，email_logs 记录明细）
 *   → 用户端可下载 JSON 发票详情 / 查看发送状态
 *
 * 说明：
 * - invoice_no 仅在 issue 时生成（申请阶段为 NULL，故列允许空）；
 * - type：ordinary=普通发票（电子）/ special=专用发票；
 * - 专票附加信息（税号/地址/电话/开户行/账号）存各列，普通发票只存 title。
 */
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'pending',
  'issued',
  'paid',
  'rejected',
  'cancelled',
  'void',
]);

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),

  // 类型与金额
  type: varchar('type', { length: 20 }).notNull().default('ordinary'), // ordinary | special
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 6, scale: 2 }).default('0'), // 13 / 6 / 1
  taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).default('0'),
  totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).default('0'),

  // 状态流转：pending → issued / rejected；issued → void
  status: invoiceStatusEnum('status').notNull().default('pending'),
  rejectReason: text('reject_reason'),

  // 开票信息
  invoiceNo: varchar('invoice_no', { length: 50 }).unique(), // 申请阶段 NULL，issue 时生成
  title: varchar('title', { length: 200 }),
  taxId: varchar('tax_id', { length: 50 }),
  address: varchar('address', { length: 200 }),
  phone: varchar('phone', { length: 50 }),
  bankName: varchar('bank_name', { length: 100 }),
  bankAccount: varchar('bank_account', { length: 100 }),
  recipient: text('recipient'),
  remark: text('remark'),

  // 收件邮箱（邮件交付）与发送状态
  email: varchar('email', { length: 255 }),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  emailStatus: varchar('email_status', { length: 20 }), // sent | skipped | failed

  issuedAt: timestamp('issued_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
