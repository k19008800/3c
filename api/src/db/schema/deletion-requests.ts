import { pgTable, serial, integer, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 用户账号注销申请（P2-4，对齐 SPEC-§2 §2.11 用户账号注销）
 *
 * 生命周期：
 *   用户提交（pending）→ 管理员审核（approve / reject）
 *   → 审核通过：cool_down_until = now + 7 天冷静期，账号标记 deleting（仍可登录查看进度）
 *   → 冷静期内可 cancel（恢复 active）→ 冷静期后执行数据清除（deleted）→ 账号物理删除
 * 边界：余额 > 0 需提示；有归属客户/代理身份的需先处理；实名信息审核通过后退回。
 *
 * @see docs/SPEC-§2-用户体系.md §2.11
 * @see docs/api-contract.md §2.1 /me/deletion/*
 * @see docs/iteration-plan-v2.md P2-4
 */
export const deletionRequests = pgTable('deletion_requests', {
  id: serial('id').primaryKey(),
  /** 同一用户同时仅允许一个未完结申请（pending/approved 时禁止重复提交） */
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  /** 注销原因（必填） */
  reason: varchar('reason', { length: 200 }).notNull(),
  /** 'pending' | 'approved' | 'rejected' | 'cancelled' | 'deleted' */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  /** 审核管理员 id */
  adminId: integer('admin_id').references(() => users.id, { onDelete: 'set null' }),
  /** 审核备注 / 驳回原因 */
  adminNote: text('admin_note'),
  /** 审核通过后的冷静期截止时间（默认 +7 天），届时可执行数据清除 */
  coolDownUntil: timestamp('cool_down_until'),
  /** 实际执行数据清除的时间（status=deleted） */
  deletedAt: timestamp('deleted_at'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  /** 待处理列表查询：pending/approved 按创建时间倒序 */
  statusIdx: index('idx_deletion_requests_status').on(table.status, table.createdAt),
}));
