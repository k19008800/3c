import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * 撤销操作日志（运维配置 → 撤销操作日志）
 * 管理员敏感操作快照；在窗口期内可一键恢复快照（幂等）。
 * 由 admin-customers 的状态切换等敏感写操作写入，运维后台执行撤销。
 */
export const undoRecords = pgTable('undo_records', {
  id: serial('id').primaryKey(),
  operationType: varchar('operation_type', { length: 50 }).notNull(),
  operationLabel: varchar('operation_label', { length: 200 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: varchar('target_id', { length: 100 }).notNull(),
  snapshot: varchar('snapshot', { length: 500 }).notNull(),
  operatorId: integer('operator_id'),
  reverted: varchar('reverted', { length: 20 }).notNull().default('no'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
