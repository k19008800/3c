import {
  pgTable,
  serial,
  integer,
  bigint,
  numeric,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { agentProfiles } from "./agent-profiles";

/**
 * 代理佣金记录表
 * 对齐 supplement/04-代理佣金与结算.md §2/§3
 * 当用户（归属该代理）消费时，按 agent_profiles.commission_rate 为代理记一笔佣金
 * UNIQUE(agent_id, billing_log_id) 保证同一笔消费不会重复计佣
 * 状态: settled(已结算可提现) / pending(待结算)
 */
export const agentCommissions = pgTable(
  "agent_commissions",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => users.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    // 关联消费记录（分区表，仅普通列 + unique 防重）
    billingLogId: bigint("billing_log_id", { mode: "number" }),
    // 所属代理档案（佣金率快照）
    agentProfileId: integer("agent_profile_id").references(() => agentProfiles.id),

    // 用户消费金额（元）与佣金
    consumptionAmount: numeric("consumption_amount", { precision: 18, scale: 4 }).notNull(),
    rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 4 }).notNull(),

    // 等级与结算状态
    level: varchar("level", { length: 20 }),
    status: varchar("status", { length: 20 }).notNull().default("settled"),

    // 按天归属（用于日报/月报）
    periodDate: timestamp("period_date", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_comm_agent_billing").on(table.agentId, table.billingLogId),
    index("idx_comm_agent").on(table.agentId),
    index("idx_comm_agent_created").on(table.agentId, table.createdAt),
  ],
);

export type AgentCommission = typeof agentCommissions.$inferSelect;
export type NewAgentCommission = typeof agentCommissions.$inferInsert;
