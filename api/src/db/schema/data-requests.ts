import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 用户数据导出请求（P2-4，对齐 SPEC-§4 数据生命周期管理 / /me/data-export 契约）
 *
 * 流转：用户提交（pending）→ 管理员审核（approve / reject）→
 * 导出文件生成（exported，file_path + 过期时间）→ 用户下载（file_expires_at 内）。
 * 撤回：用户可在 pending 状态下 cancel。
 *
 * @see docs/SPEC-§4-管理后台.md 数据生命周期管理
 * @see docs/api-contract.md §2.1 /me/data-export/request
 * @see docs/iteration-plan-v2.md P2-4
 */
export const dataRequests = pgTable('data_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'data_export'（预留扩展：'data_archive' 等） */
  requestType: varchar('request_type', { length: 50 }).notNull().default('data_export'),
  /** 'pending' | 'approved' | 'rejected' | 'exported' | 'cancelled' */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  /** 导出范围：'all' | 'consumption' | 'apikeys' | 'profile'（可组合，逗号分隔） */
  dataScope: varchar('data_scope', { length: 100 }).notNull().default('all'),
  /** 申请理由（可选） */
  reason: text('reason'),
  /** 审核管理员 id */
  adminId: integer('admin_id').references(() => users.id, { onDelete: 'set null' }),
  /** 审核备注 */
  adminNote: text('admin_note'),
  /** 导出文件相对路径（exported 后写入） */
  filePath: varchar('file_path', { length: 500 }),
  /** 下载链接过期时间（默认 72h） */
  fileExpiresAt: timestamp('file_expires_at'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
