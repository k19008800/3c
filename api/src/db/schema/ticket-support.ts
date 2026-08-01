import { pgTable, serial, integer, varchar, boolean, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tickets } from "./tickets";

/** 工单回复 对齐 SPEC-§26 */
export const ticketReplies = pgTable(
  "ticket_replies",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull().references(() => tickets.id),
    userId: integer("user_id").notNull().references(() => users.id),
    isStaff: boolean("is_staff").notNull().default(false),
    content: text("content").notNull(),
    attachments: text("attachments"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_ticket_rep_ticket").on(table.ticketId)],
);

/** 工单满意度评价 对齐 SPEC-§26.7 */
export const ticketSatisfaction = pgTable(
  "ticket_satisfaction",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull().references(() => tickets.id),
    rating: integer("rating").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_ticket_sat_ticket").on(table.ticketId)],
);

/** 工单操作日志 对齐 SPEC-§26 */
export const ticketOperationLogs = pgTable(
  "ticket_operation_logs",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull().references(() => tickets.id),
    operatorId: integer("operator_id"),
    action: varchar("action", { length: 50 }).notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_ticket_op_ticket").on(table.ticketId)],
);

/** 工单标签定义 对齐 SPEC-§26 */
export const ticketTagDefs = pgTable(
  "ticket_tag_defs",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
