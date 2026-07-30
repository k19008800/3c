// ============================================================
//  3cloud (3C) — 在线聊天（§27）
//  chat_sessions + chat_messages + chat_presets + staff_operation_logs
// ============================================================

import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// 聊天会话
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  staffId: integer("staff_id").references(() => users.id),
  status: varchar("status", { length: 20 }).default("waiting"),
  category: varchar("category", { length: 30 }),
  queuePosition: integer("queue_position"),
  waitingStartedAt: timestamp("waiting_started_at"),
  staffAssignedAt: timestamp("staff_assigned_at"),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// 聊天消息
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => chatSessions.id),
  senderId: integer("sender_id").notNull().references(() => users.id),
  senderType: varchar("sender_type", { length: 10 }).notNull(),
  contentType: varchar("content_type", { length: 20 }).default("text"),
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 预设消息
export const chatPresets = pgTable("chat_presets", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  title: varchar("title", { length: 100 }),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// 客服操作日志
export const staffOperationLogs = pgTable("staff_operation_logs", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => users.id),
  operationType: varchar("operation_type", { length: 50 }).notNull(),
  targetUserId: integer("target_user_id").references(() => users.id),
  targetType: varchar("target_type", { length: 30 }),
  targetId: varchar("target_id", { length: 50 }),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  reason: varchar("reason", { length: 500 }),
  ip: varchar("ip", { length: 45 }),
  rollbackToId: integer("rollback_to_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
