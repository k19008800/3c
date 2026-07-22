// ============================================================
//  3cloud (3C) — 提示词审计日志
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";

import { auditStatusEnum, responseStatusEnum } from "./enums.js";
import { users } from "./users.js";
import { apiKeys } from "./api-keys.js";

// ── 提示词审计日志 ──

export const promptAuditLogs = pgTable(
  "prompt_audit_logs",
  {
    id: serial("id").primaryKey(),
    // 关联调用记录（可选，call_logs 是分区表，跨表 FK 不支持）
    callLogId: integer("call_log_id"),
    callLogCreatedAt: timestamp("call_log_created_at", { withTimezone: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    apiKeyId: integer("api_key_id")
      .references(() => apiKeys.id, { onDelete: "set null" }),
    modelName: varchar("model_name", { length: 100 }),

    // 原始提示词
    prompt: text("prompt").notNull(),
    promptHash: varchar("prompt_hash", { length: 64 }).notNull(), // SHA256

    // 响应摘要（前 500 字）
    responseSummary: text("response_summary"),
    responseStatus: responseStatusEnum("response_status").notNull().default("success"),

    // 敏感词检测结果
    isSensitive: boolean("is_sensitive").notNull().default(false),
    sensitiveWords: text("sensitive_words").array(),

    // 审核状态
    auditStatus: auditStatusEnum("audit_status").notNull().default("pending"),
    auditedBy: integer("audited_by").references(() => users.id, { onDelete: "set null" }),
    auditedAt: timestamp("audited_at", { withTimezone: true }),
    flagReason: text("flag_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("prompt_audit_user_idx").on(table.userId),
    apiKeyIdx: index("prompt_audit_api_key_idx").on(table.apiKeyId),
    modelNameIdx: index("prompt_audit_model_idx").on(table.modelName),
    promptHashIdx: index("prompt_audit_hash_idx").on(table.promptHash),
    isSensitiveIdx: index("prompt_audit_sensitive_idx").on(table.isSensitive),
    auditStatusIdx: index("prompt_audit_status_idx").on(table.auditStatus),
    createdAtIdx: index("prompt_audit_created_idx").on(table.createdAt),
  })
);

// ── 敏感词库 ──

export const sensitiveWords = pgTable(
  "sensitive_words",
  {
    id: serial("id").primaryKey(),
    word: varchar("word", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull().default("general"), // general/political/porn/fraud/custom
    severity: varchar("severity", { length: 20 }).notNull().default("medium"), // low/medium/high/critical
    description: text("description"),
    hitCount: integer("hit_count").notNull().default(0),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    wordIdx: index("sensitive_words_word_idx").on(table.word),
    categoryIdx: index("sensitive_words_category_idx").on(table.category),
    enabledIdx: index("sensitive_words_enabled_idx").on(table.enabled),
  })
);
