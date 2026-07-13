// ============================================================
//  3cloud (3C) — 兑换码系统
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import {
  redemptionBatchStatusEnum,
  redemptionCodeStatusEnum,
} from "./enums.js";
import { users } from "./users.js";

// ── 兑换批次 ──

export const redemptionBatches = pgTable(
  "redemption_batches",
  {
    id: serial("id").primaryKey(),
    creatorId: integer("creator_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    totalCount: integer("total_count").notNull(),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    status: redemptionBatchStatusEnum("status").notNull().default("active"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    creatorIdIdx: index("redemption_batches_creator_id_idx").on(table.creatorId),
    statusIdx: index("redemption_batches_status_idx").on(table.status),
    expiresAtIdx: index("redemption_batches_expires_at_idx").on(table.expiresAt),
  })
);

// ── 兑换码 ──

export const redemptionCodes = pgTable(
  "redemption_codes",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => redemptionBatches.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 16 }).notNull().unique(),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    usesLeft: integer("uses_left").notNull().default(1),
    status: redemptionCodeStatusEnum("status").notNull().default("unused"),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("redemption_codes_code_idx").on(table.code),
    batchIdIdx: index("redemption_codes_batch_id_idx").on(table.batchId),
    statusIdx: index("redemption_codes_status_idx").on(table.status),
  })
);

// ── 兑换日志 ──

export const redemptionLogs = pgTable(
  "redemption_logs",
  {
    id: serial("id").primaryKey(),
    codeId: integer("code_id")
      .notNull()
      .references(() => redemptionCodes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    batchId: integer("batch_id").references(() => redemptionBatches.id),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdIdx: index("redemption_logs_code_id_idx").on(table.codeId),
    userIdIdx: index("redemption_logs_user_id_idx").on(table.userId),
    userCreatedAtIdx: index("redemption_logs_user_created_at_idx").on(table.userId, table.createdAt.desc()),
  })
);

// ── 兑换码风控事件 ──

export const redemptionFraudEvents = pgTable(
  "redemption_fraud_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userId: integer("user_id"),
    codeId: integer("code_id"),
    code: varchar("code", { length: 16 }),
    riskScore: integer("risk_score").notNull().default(0),
    detail: text("detail"),
    severity: varchar("severity", { length: 20 }).notNull().default("warning"),
    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedBy: integer("acknowledged_by"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventTypeIdx: index("redeem_fraud_events_type_idx").on(table.eventType),
    ipIdx: index("redeem_fraud_events_ip_idx").on(table.ip),
    severityIdx: index("redeem_fraud_events_severity_idx").on(table.severity),
    acknowledgedIdx: index("redeem_fraud_events_ack_idx").on(table.acknowledged),
    createdAtIdx: index("redeem_fraud_events_created_at_idx").on(table.createdAt),
  })
);

// ── 兑换码转赠日志 ──

export const redemptionGiftLogs = pgTable(
  "redemption_gift_logs",
  {
    id: serial("id").primaryKey(),
    originalCodeId: integer("original_code_id").notNull(),
    newCodeId: integer("new_code_id").notNull(),
    batchId: integer("batch_id").notNull(),
    fromUserId: integer("from_user_id").notNull().references(() => users.id),
    toUserId: integer("to_user_id").notNull().references(() => users.id),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fromUserIdIdx: index("gift_logs_from_user_id_idx").on(table.fromUserId),
    toUserIdIdx: index("gift_logs_to_user_id_idx").on(table.toUserId),
    batchIdIdx: index("gift_logs_batch_id_idx").on(table.batchId),
    createdAtIdx: index("gift_logs_created_at_idx").on(table.createdAt),
  })
);

