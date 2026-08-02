import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 账号注销请求表
 * 对齐 docs/sprint-1/01-account-deletion-overview.md §2
 */
export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    coolingDeadline: timestamp("cooling_deadline", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    processedBy: integer("processed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * 注销检查清单表
 */
export const deletionChecklist = pgTable("deletion_checklist", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .references(() => accountDeletionRequests.id, { onDelete: "cascade" }),
  checkItem: varchar("check_item", { length: 50 }).notNull(),
  passed: varchar("passed", { length: 10 }).notNull().default("false"),
  detail: text("detail"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueRequestItem: uniqueIndex("idx_checklist_request_item").on(table.requestId, table.checkItem),
}));

export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;
export type NewAccountDeletionRequest = typeof accountDeletionRequests.$inferInsert;
export type DeletionChecklistItem = typeof deletionChecklist.$inferSelect;
export type NewDeletionChecklistItem = typeof deletionChecklist.$inferInsert;
