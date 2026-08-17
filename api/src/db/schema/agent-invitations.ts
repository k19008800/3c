import { pgTable, serial, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { users } from './users';

/**
 * 代理商邀请码（P1-2）
 *
 * 邀请码生命周期：生成（code/regenerate）→ 注册关联（注册携带 invite_code 命中）→
 * 使用记录查询（records）。同一代理商可多次 regenerate，历史码保留（status=disabled），
 * 当前有效码唯一（status=active）。
 *
 * @see docs/iteration-plan-v2.md P1-2
 */
export const agentInvitations = pgTable('agent_invitations', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  /** 邀请码（唯一；regenerate 生成新码，旧码置 disabled） */
  code: varchar('code', { length: 32 }).notNull().unique(),
  /** 'active' | 'disabled' */
  status: varchar('status', { length: 20 }).notNull().default('active'),
  /** 注册关联的用户（null = 未使用） */
  usedBy: integer('used_by').references(() => users.id),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentIdx: index('idx_agent_invitations_agent').on(table.agentId),
  statusIdx: index('idx_agent_invitations_status').on(table.status),
}));
