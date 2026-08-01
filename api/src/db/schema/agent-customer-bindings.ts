import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 客户归属绑定表（后台主导 · 报备划拨制）
 * 对齐 PRD-代理商体系-后台主导版.md + SPEC-代理商后台主导版.md
 * 一个客户同一时刻只有一条 active 归属（UNIQUE(customer_user_id, status)）
 * 归属唯一来源 = 后台报备划拨（无用户自助绑定）
 */
export const agentCustomerBindings = pgTable(
  "agent_customer_bindings",
  {
    id: serial("id").primaryKey(),
    agentUserId: integer("agent_user_id")
      .notNull()
      .references(() => users.id),
    customerUserId: integer("customer_user_id")
      .notNull()
      .references(() => users.id),
    // active / inactive
    status: varchar("status", { length: 20 }).notNull().default("active"),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
    unboundAt: timestamp("unbound_at", { withTimezone: true }),
    // 后台操作人
    operatorId: integer("operator_id").references(() => users.id),
    reason: varchar("reason", { length: 500 }),
  },
  (table) => [
    uniqueIndex("acb_customer_unique_active").on(table.customerUserId, table.status),
    index("idx_acb_agent").on(table.agentUserId),
    index("idx_acb_customer").on(table.customerUserId),
  ],
);

export type AgentCustomerBinding = typeof agentCustomerBindings.$inferSelect;
export type NewAgentCustomerBinding = typeof agentCustomerBindings.$inferInsert;
