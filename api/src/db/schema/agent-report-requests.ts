import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 报备审核队列表（后台主导 · 报备划拨制）
 * 代理商向后台报备目标客户，后台审核（pending/passed/rejected）
 * 审核通过 → 自动划拨（写入 agent_customer_bindings）
 */
export const agentReportRequests = pgTable(
  "agent_report_requests",
  {
    id: serial("id").primaryKey(),
    agentUserId: integer("agent_user_id")
      .notNull()
      .references(() => users.id),
    // 目标客户定位（三选一，至少一种）
    targetPhone: varchar("target_phone", { length: 32 }),
    targetEmail: varchar("target_email", { length: 255 }),
    targetUserId: integer("target_user_id").references(() => users.id),
    note: varchar("note", { length: 500 }),
    // pending / passed / rejected
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    auditOperatorId: integer("audit_operator_id").references(() => users.id),
    auditAt: timestamp("audit_at", { withTimezone: true }),
    rejectReason: varchar("reject_reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_arr_status").on(table.status),
    index("idx_arr_agent").on(table.agentUserId),
  ],
);

export type AgentReportRequest = typeof agentReportRequests.$inferSelect;
export type NewAgentReportRequest = typeof agentReportRequests.$inferInsert;
