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
import { users } from "./users";

/**
 * 兑换码批次表
 * 对齐 ref-4.5-marketing.md §2 兑换码系统
 * 管理端创建批次并生成 N 个兑换码，用户用码兑换余额
 */
export const redemptionBatches = pgTable(
  "redemption_batches",
  {
    id: serial("id").primaryKey(),
    creatorId: integer("creator_id").notNull().references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    // 单个码面额（元）
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    totalCount: integer("total_count").notNull().default(0),
    usedCount: integer("used_count").notNull().default(0),
    // 过期为 null = 永久有效
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active/disabled
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rb_status").on(table.status),
    index("idx_rb_creator").on(table.creatorId),
  ],
);

/**
 * 兑换码表
 * 一个批次生成多个码，每个码: 8-16 位大写字母数字，唯一
 */
export const redemptionCodes = pgTable(
  "redemption_codes",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id").notNull().references(() => redemptionBatches.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull().unique(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("unused"), // unused/used
    usedBy: integer("used_by"),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rc_batch").on(table.batchId),
    index("idx_rc_status").on(table.status),
  ],
);

/**
 * 兑换记录表（用户兑换历史）
 */
export const redemptionLogs = pgTable(
  "redemption_logs",
  {
    id: serial("id").primaryKey(),
    codeId: integer("code_id").notNull().references(() => redemptionCodes.id),
    userId: integer("user_id").notNull().references(() => users.id),
    batchId: integer("batch_id").references(() => redemptionBatches.id),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rl_user").on(table.userId),
    index("idx_rl_created").on(table.createdAt),
  ],
);

export type RedemptionBatch = typeof redemptionBatches.$inferSelect;
export type RedemptionCode = typeof redemptionCodes.$inferSelect;
export type RedemptionLog = typeof redemptionLogs.$inferSelect;
