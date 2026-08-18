import { pgTable, serial, integer, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';
import { users } from './users';

/**
 * 代理商客户报备审核（对齐原型 admin-agent-customer-approval.html / 报备划拨制）
 *
 * 生命周期：
 *   代理商报备 → pending（待审核）
 *   → 后台 approve（通过并自动划拨：写入 agent_customers 绑定）→ bound（已通过且已绑定）
 *   → 后台 unbind（解绑：删除 agent_customers 绑定）→ approved（已通过、未绑定）
 *   → 后台 reject（驳回，reject_reason 必填）→ rejected
 *   → 后台 re-review（重新审核）→ pending
 *
 * 状态枚举：pending / approved / bound / rejected
 * 说明：approve 落库为 bound（通过即绑定），与「unbind: bound→approved」形成闭环；
 *       前端四张列表（待审核/已通过/已驳回/已绑定）分别对应四种状态。
 *
 * @see docs/PRD-代理商体系-后台主导版.md（报备划拨制 D2：客户归属唯一来源=报备+后台审核+自动划拨）
 * @see docs/prototype-gap-mapping.md（admin-agent-customer-approval.html → /admin/agents/approvals）
 */
export const agentApprovals = pgTable('agent_approvals', {
  id: serial('id').primaryKey(),
  /** 报备代理商（agents.id） */
  agentId: integer('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  /** 报备目标客户（users.id，客户归属对象） */
  customerId: integer('customer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'pending' | 'approved' | 'bound' | 'rejected' */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  /** 驳回原因（reject 时必填） */
  rejectReason: text('reject_reason'),
  /** 代理商报备备注 */
  note: text('note'),
  /** 审核管理员 id（approve/reject 时记录） */
  reviewerId: integer('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  /** 最近一次审核时间 */
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  /** 审核队列查询：按状态 + 创建时间倒序 */
  statusIdx: index('idx_agent_approvals_status').on(table.status, table.createdAt),
  /** 同一代理商对同一客户的报备（重复报备检查） */
  pairIdx: index('idx_agent_approvals_pair').on(table.agentId, table.customerId),
}));

export const agentApprovalsRelations = relations(agentApprovals, ({ one }) => ({
  agent: one(agents, {
    fields: [agentApprovals.agentId],
    references: [agents.id],
  }),
  customer: one(users, {
    fields: [agentApprovals.customerId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [agentApprovals.reviewerId],
    references: [users.id],
  }),
}));
