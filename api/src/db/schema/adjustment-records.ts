import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text } from 'drizzle-orm/pg-core';
import { users } from './users';

/** 调账状态：pending(一级待审) / pending_level2(二级待审) / approved(已生效) / rejected(已驳回) / reversed(已红冲) */
export const adjustmentStatusEnum = pgEnum('adjustment_status', [
  'pending',
  'pending_level2',
  'approved',
  'rejected',
  'reversed',
]);

/**
 * 手动调账记录（产品裁决 2026-08-15，对齐原型 admin-adjust.html）
 *
 * 分级审批规则（对齐原型）：
 *   调增 < ¥10,000          → 免审批（提交即生效）
 *   调增 ≥ ¥10,000          → 一级审批（财务专员）
 *   调减 < ¥10,000          → 一级审批
 *   调减 ≥ ¥10,000          → 二级审批（财务主管复核）
 * 职责分离：申请人 ≠ 审批人；错误调账不删除不编辑，通过「红字冲销」生成反向记录。
 */
export const adjustmentRecords = pgTable('adjustment_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id), // 被调账用户
  direction: varchar('direction', { length: 10 }).notNull(), // increase | decrease
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(),
  reason: text('reason').notNull(),
  /** 会计科目（业务类型） */
  subject: varchar('subject', { length: 50 }).notNull(),
  /** 关联单号（工单/订单/退款单/审批单） */
  referenceNo: varchar('reference_no', { length: 100 }),
  /** 凭证附件名（可选） */
  attachment: varchar('attachment', { length: 255 }),
  /** 审批级别：none(免审) | level1 | level2 */
  approvalLevel: varchar('approval_level', { length: 10 }).notNull(),
  status: adjustmentStatusEnum('status').notNull().default('pending'),
  /** 调账前后余额快照 */
  balanceBefore: numeric('balance_before', { precision: 18, scale: 8 }),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 8 }),
  /** 申请人 / 审批人（职责分离，审批人 ≠ 申请人） */
  requestedBy: integer('requested_by').notNull().references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  reviewedBy: integer('reviewed_by').references(() => users.id), // 二级审批人
  rejectReason: text('reject_reason'),
  /** 红冲反向记录 id */
  reversedById: integer('reversed_by_id'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AdjustmentRecord = typeof adjustmentRecords.$inferSelect;
