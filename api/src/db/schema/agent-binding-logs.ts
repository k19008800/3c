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
 * 归属变更审计日志表（后台主导 · 报备划拨制）
 * action: bind / transfer / unbind / migrate
 * 归属变更全程留痕（操作人/时间/原因/前后归属）
 */
export const agentBindingLogs = pgTable(
  "agent_binding_logs",
  {
    id: serial("id").primaryKey(),
    customerUserId: integer("customer_user_id")
      .notNull()
      .references(() => users.id),
    fromAgentUserId: integer("from_agent_user_id").references(() => users.id),
    toAgentUserId: integer("to_agent_user_id").references(() => users.id),
    action: varchar("action", { length: 20 }).notNull(),
    operatorId: integer("operator_id").references(() => users.id),
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_abl_customer").on(table.customerUserId),
    index("idx_abl_created").on(table.createdAt),
  ],
);

export type AgentBindingLog = typeof agentBindingLogs.$inferSelect;
export type NewAgentBindingLog = typeof agentBindingLogs.$inferInsert;
