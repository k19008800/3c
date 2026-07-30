// ============================================================
//  3cloud (3C) — 工单系统（§26）
//  tickets + ticket_replies + ticket_satisfaction + ticket_operation_logs + ticket_tag_defs
// ============================================================

import { pgTable, serial, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// 工单主表
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNo: varchar("ticket_no", { length: 30 }).notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  priority: varchar("priority", { length: 20 }).default("normal"),
  status: varchar("status", { length: 20 }).default("pending"),
  description: text("description").notNull(),
  attachments: text("attachments"),
  assigneeId: integer("assignee_id").references(() => users.id),
  tags: text("tags"),
  source: varchar("source", { length: 20 }).default("user"),
  firstResponseAt: timestamp("first_response_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 工单回复
export const ticketReplies = pgTable("ticket_replies", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  isStaff: boolean("is_staff").default(false),
  content: text("content").notNull(),
  attachments: text("attachments"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 工单标签定义
export const ticketTagDefs = pgTable("ticket_tag_defs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 满意度评价
export const ticketSatisfaction = pgTable("ticket_satisfaction", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().unique().references(() => tickets.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 工单操作日志
export const ticketOperationLogs = pgTable("ticket_operation_logs", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  operatorId: integer("operator_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow(),
});
