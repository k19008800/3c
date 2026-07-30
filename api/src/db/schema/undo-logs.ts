// ============================================================
//  3cloud (3C) — 撤销操作日志表
//  undo_logs 表定义 — 持久化撤销操作记录
// ============================================================

import { pgTable, serial, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const undoLogs = pgTable("undo_logs", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 36 }).notNull().unique(),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: integer("resource_id").notNull(),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  beforeData: jsonb("before_data").notNull().default({}),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  undoneAt: timestamp("undone_at"),
  createdAt: timestamp("created_at").defaultNow(),
});