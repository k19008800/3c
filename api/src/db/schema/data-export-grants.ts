/**
 * 数据导出授权表 — data_export_grants（数据导出授权管理，PRD-数据导出授权管理 §3）
 *
 * 背景：用户端「数据导出」能力默认隐藏，由后台管理员定向授权给特定用户。
 * 本表是「能力开关」：user_id 唯一，一条记录通过 is_enabled 置位实现启/停。
 * 与既有 data_requests（导出申请流水）是两个独立数据域——授权是能力开关，
 * 申请是一次导出流水；授权停用不影响已生成文件的历史记录。
 *
 * 字段语义：
 * - is_enabled：授权开关（true=启用，用户端可见+可导出；false=停用）。
 * - granted_by / granted_at：最近一次启用授权的操作人与时间。
 * - disabled_by / disabled_at：最近一次停用的操作人与时间。
 * - remark：授权备注（授权原因/有效场景等）。
 *
 * 约束：
 * - user_id 唯一索引 uq_data_export_grants_user_id：一个用户仅一条授权记录。
 * - 外键不级联删除（coding-standards §2.2）：用户被删除后授权记录保留用于审计。
 *
 * @module db/schema
 * @see docs/PRD-数据导出授权管理.md §3 授权数据模型
 */
import { pgTable, serial, integer, boolean, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const dataExportGrants = pgTable('data_export_grants', {
  id: serial('id').primaryKey(),
  /** 被授权用户；唯一，一个用户一条授权记录 */
  userId: integer('user_id')
    .notNull()
    .references(() => users.id), // 不级联删除：用户删除后授权记录保留用于审计
  /** 授权开关：true=启用（用户可见+可导出），false=停用 */
  isEnabled: boolean('is_enabled').notNull().default(true),
  /** 最近一次启用授权的操作人 */
  grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
  /** 最近一次启用授权的时间 */
  grantedAt: timestamp('granted_at').defaultNow(),
  /** 最近一次停用的操作人 */
  disabledBy: integer('disabled_by').references(() => users.id, { onDelete: 'set null' }),
  /** 最近一次停用时间 */
  disabledAt: timestamp('disabled_at'),
  /** 授权备注（授权原因/有效场景等），≤500 字符 */
  remark: varchar('remark', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdUnique: uniqueIndex('uq_data_export_grants_user_id').on(table.userId),
  /** 供「列出全部已授权用户（is_enabled=true）」过滤 */
  enabledIdx: index('idx_data_export_grants_enabled').on(table.isEnabled),
}));

export type DataExportGrant = typeof dataExportGrants.$inferSelect;
export type NewDataExportGrant = typeof dataExportGrants.$inferInsert;
