// ============================================================
//  3cloud (3C) — 兑换码批次模板
//  辅助表：agent 保存常用生成配置以便复用
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const codeTemplates = pgTable(
  "code_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("fixed_token"),
    tokenAmount: numeric("token_amount", { precision: 18, scale: 6 }).notNull(),
    validDays: integer("valid_days"),
    maxPerUser: integer("max_per_user").notNull().default(1),
    userScope: varchar("user_scope", { length: 20 }).notNull().default("all"),
    remark: text("remark"),
    createdByType: varchar("created_by_type", { length: 10 }).notNull(),
    createdById: integer("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    creatorIdx: index("code_templates_creator_idx").on(table.createdByType, table.createdById),
  })
);

// ── 兑换通知日志表 ──

export const codeNotificationLogs = pgTable(
  "code_notification_logs",
  {
    id: serial("id").primaryKey(),
    codeId: integer("code_id"),
    userId: integer("user_id"),
    notifyType: varchar("notify_type", { length: 30 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    title: varchar("title", { length: 128 }),
    content: text("content"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("codenotif_user_idx").on(table.userId),
    statusIdx: index("codenotif_status_idx").on(table.status),
  })
);
