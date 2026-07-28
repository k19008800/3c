// ============================================================
//  3cloud (3C) — 账号注销/删除请求
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * 账号注销请求表
 * 用户发起注销 → cooling 冻结期（7天可撤销）→ completed 自动执行
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
    // pending / cooling / completed / cancelled / rejected
    coolingDeadline: timestamp("cooling_deadline", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    processedBy: integer("processed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // 一个用户同时只有一个活跃注销请求
    userStatusIdx: uniqueIndex("adr_user_status_idx").on(table.userId, table.status),
    coolingDeadlineIdx: uniqueIndex("adr_cooling_deadline_idx").on(table.status, table.coolingDeadline),
  })
);

/**
 * 注销检查项清单
 */
export const deletionChecklist = pgTable(
  "deletion_checklist",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => accountDeletionRequests.id, { onDelete: "cascade" }),
    checkItem: varchar("check_item", { length: 50 }).notNull(),
    // balance_cleared / no_pending_withdraw / no_unsettled_bills
    // no_active_keys / no_pending_invoices / no_active_agent
    passed: varchar("passed", { length: 10 }).notNull().default("false"),
    detail: text("detail"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: uniqueIndex("dc_request_idx").on(table.requestId, table.checkItem),
  })
);
