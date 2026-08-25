import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

/** 调账状态：pending(一级待审) / pending_level2(二级待审) / pending_super(super_admin 终审待审，R5 tier3) / approved(已生效) / rejected(已驳回) / reversed(已红冲) */
export const adjustmentStatusEnum = pgEnum('adjustment_status', [
  'pending',
  'pending_level2',
  'pending_super',
  'approved',
  'rejected',
  'reversed',
]);

/**
 * 手动调账记录（产品裁决 2026-08-15 + R5 整改阶段二，对齐原型 admin-adjust.html）
 *
 * R5 统一大额规则（双签 B1/B2，ARCH §2.4.3）：
 *   调增/调减 ≤ ¥10,000      → level1（一级审批；调减恰 ¥10,000 特例仍 level2）
 *   > ¥10,000 且 ≤ ¥100,000  → level2（一级 → 二级复核）
 *   > ¥100,000               → level3（一级 → 二级 → super_admin 终审）
 *   金额型免审批废止；仅白名单科目免审（默认关闭）命中时 approval_level='none' 提交即生效。
 * 状态流转：pending → pending_level2 → pending_super → approved；任一步驳回 → rejected。
 * 职责分离：申请人 ≠ 审批人；一级 ≠ 二级；终审 ≠ 前两级审批人。
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
  /** 审批级别：none(白名单免审) | level1 | level2 | level3 */
  approvalLevel: varchar('approval_level', { length: 10 }).notNull(),
  status: adjustmentStatusEnum('status').notNull().default('pending'),
  /** 调账前后余额快照 */
  balanceBefore: numeric('balance_before', { precision: 18, scale: 8 }),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 8 }),
  /** 申请人 / 审批人（职责分离，审批人 ≠ 申请人） */
  requestedBy: integer('requested_by').notNull().references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  reviewedBy: integer('reviewed_by').references(() => users.id), // 二级审批人
  /** super_admin 终审人（R5 tier3；migration 0030） */
  superReviewedBy: integer('super_reviewed_by').references(() => users.id),
  /** 是否因 R6 限额升级审批级别（migration 0030；PRD §3.1.2 limit_escalated） */
  limitEscalated: boolean('limit_escalated').notNull().default(false),
  /** 升级 / 降级代审原因（migration 0030；PRD §3.1.2 escalation_reason） */
  escalationReason: varchar('escalation_reason', { length: 255 }),
  rejectReason: text('reject_reason'),
  /** 红冲反向记录 id */
  reversedById: integer('reversed_by_id'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AdjustmentRecord = typeof adjustmentRecords.$inferSelect;
