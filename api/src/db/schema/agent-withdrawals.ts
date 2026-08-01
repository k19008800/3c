import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { agentProfiles } from "./agent-profiles";

/**
 * 代理提现订单表
 * 对齐 PRD-代理商体系 §3.4 + flowcharts/02-agent-withdraw.md（双审流程）
 * 状态机: pending_first_review → pending_second_review → processing → completed
 *                     \--→ rejected（初审或复审拒绝）
 *
 * 双审角色: 初审(财务初审) / 复审(由 site_configs.withdraw_second_review_role 决定)
 * 冻结机制: 提交时扣减可提现余额到 users.pending_balance，审核拒绝/打款失败时解冻
 */
export const agentWithdrawals = pgTable(
  "agent_withdrawals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    // 提交时的代理档案快照（账户/银行/姓名），防止后续修改影响审核
    agentProfileId: integer("agent_profile_id").references(() => agentProfiles.id),

    // 提现单号
    withdrawalNo: varchar("withdrawal_no", { length: 64 }).notNull().unique(),

    // 金额（元，保留 4 位小数，与计费精度一致）
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),

    // 收款信息（提交时快照）
    account: varchar("account", { length: 64 }).notNull(),
    bank: varchar("bank", { length: 100 }),
    accountName: varchar("account_name", { length: 50 }),

    // 状态机
    status: varchar("status", { length: 30 }).notNull().default("pending_first_review"),

    // 审核记录
    firstReviewerId: integer("first_reviewer_id"),
    firstReviewAt: timestamp("first_review_at", { withTimezone: true }),
    firstReviewNote: varchar("first_review_note", { length: 500 }),
    secondReviewerId: integer("second_reviewer_id"),
    secondReviewAt: timestamp("second_review_at", { withTimezone: true }),
    secondReviewNote: varchar("second_review_note", { length: 500 }),

    // 拒绝原因 / 打款信息
    rejectReason: varchar("reject_reason", { length: 500 }),
    transferNo: varchar("transfer_no", { length: 128 }),
    transferAt: timestamp("transfer_at", { withTimezone: true }),

    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_aw_user").on(table.userId),
    index("idx_aw_status").on(table.status),
    index("idx_aw_created").on(table.createdAt),
  ],
);

export type AgentWithdrawal = typeof agentWithdrawals.$inferSelect;
export type NewAgentWithdrawal = typeof agentWithdrawals.$inferInsert;
