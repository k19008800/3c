import {
  pgTable, serial, integer, varchar, boolean, text, timestamp, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 工单系统 对齐 SPEC-§26
 * tickets 主表 + 状态机: pending → processing → resolved → closed
 */
export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    ticketNo: varchar("ticket_no", { length: 30 }).notNull().unique(),
    userId: integer("user_id").notNull().references(() => users.id),
    title: varchar("title", { length: 200 }).notNull(),
    category: varchar("category", { length: 30 }).notNull(),
    // billing / api / account / key / invoice_refund / feature_request / other
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),
    // low / normal / high / urgent
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending / processing / resolved / closed
    description: text("description").notNull(),
    attachments: text("attachments"), // JSON array
    assigneeId: integer("assignee_id").references(() => users.id),
    tags: text("tags"), // 逗号分隔
    source: varchar("source", { length: 20 }).notNull().default("user"),
    // user / chat_transfer / chat_offline / chat_timeout / system
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: varchar("closed_by", { length: 20 }),
    isSpam: boolean("is_spam").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_tickets_user").on(table.userId),
    index("idx_tickets_status").on(table.status),
    index("idx_tickets_assignee").on(table.assigneeId),
    index("idx_tickets_created").on(table.createdAt),
  ],
);

export const TICKET_CATEGORIES = ["billing", "api", "account", "key", "invoice_refund", "feature_request", "other"] as const;
export const TICKET_STATUS: Record<string, string> = {
  pending: "待处理", processing: "处理中", resolved: "已解决", closed: "已关闭",
};
export const TICKET_PRIORITY: Record<string, string> = {
  low: "低", normal: "普通", high: "高", urgent: "紧急",
};
export const TICKET_CATEGORY_LABEL: Record<string, string> = {
  billing: "计费问题", api: "API 调用", account: "账户与安全", key: "Key 管理",
  invoice_refund: "发票与退款", feature_request: "功能建议", other: "其他",
};

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
