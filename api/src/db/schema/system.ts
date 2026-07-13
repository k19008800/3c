// ============================================================
//  3cloud (3C) — 系统 & 运营
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import {
  auditActionEnum,
  operationCategoryEnum,
} from "./enums.js";
import { users } from "./users.js";

// ── 审计日志 ──

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => users.id),
    action: auditActionEnum("action").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),   // 如 "user", "order", "config"
    targetId: integer("target_id"),
    before: jsonb("before"),                                        // 变更前快照
    after: jsonb("after"),                                          // 变更后快照
    ip: varchar("ip", { length: 45 }),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    operatorIdx: index("audit_logs_operator_idx").on(table.operatorId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    targetIdx: index("audit_logs_target_idx").on(table.targetType, table.targetId),
    targetCreatedAtIdx: index("audit_logs_target_created_at_idx").on(table.targetType, table.targetId, table.createdAt.desc()),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  })
);

// ── 操作日志（用户/代理商日常操作） ──

export const operationLogs = pgTable(
  "operation_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    userRole: varchar("user_role", { length: 20 }).notNull(),       // 'user' | 'agent' | 'admin' | 'super_admin'

    // 操作分类
    category: operationCategoryEnum("category").notNull(),
    action: varchar("action", { length: 80 }).notNull(),             // 如 'login', 'api_key_create', 'recharge_submit'

    // 操作上下文
    targetType: varchar("target_type", { length: 50 }),              // 'api_key', 'order', 'user', 'agent_client', 'redemption_code'
    targetId: integer("target_id"),
    resourceName: varchar("resource_name", { length: 200 }),         // 人类可读资源名

    // 摘要
    summary: text("summary"),                                         // 一句话摘要
    metadata: jsonb("metadata"),                                     // 附加字段（OAuth provider、UA 等）

    // 结果
    status: varchar("status", { length: 20 }).notNull().default("success"),  // 'success' | 'failure' | 'pending'
    errorReason: text("error_reason"),

    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTimeIdx: index("oplog_user_time_idx").on(table.userId, table.createdAt.desc()),
    categoryTimeIdx: index("oplog_category_time_idx").on(table.category, table.createdAt.desc()),
    actionTimeIdx: index("oplog_action_time_idx").on(table.action, table.createdAt.desc()),
    statusTimeIdx: index("oplog_status_time_idx").on(table.status, table.createdAt.desc()),
    targetIdx: index("oplog_target_idx").on(table.targetType, table.targetId),
    createdAtIdx: index("oplog_created_at_idx").on(table.createdAt),
  })
);

// ── 系统配置 ──

export const systemConfigs = pgTable(
  "system_configs",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(),
    value: text("value").notNull(),                                  // JSON 字符串存储
    description: varchar("description", { length: 500 }),
    updatedBy: integer("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("system_configs_key_idx").on(table.key),
  })
);

// ── 邮件模板 ──

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),       // register_verify / password_reset / recharge_confirm / real_name_result
    subjectZh: varchar("subject_zh", { length: 255 }).notNull(),
    subjectEn: varchar("subject_en", { length: 255 }).notNull(),
    bodyHtmlZh: text("body_html_zh").notNull(),
    bodyHtmlEn: text("body_html_en").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("email_templates_name_idx").on(table.name),
  })
);

// ── 页面内容 ──

export const pageContents = pgTable(
  "page_contents",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),       // api_docs / announcement / terms / privacy
    titleZh: varchar("title_zh", { length: 255 }).notNull(),
    titleEn: varchar("title_en", { length: 255 }),
    contentMarkdownZh: text("content_markdown_zh"),
    contentMarkdownEn: text("content_markdown_en"),
    status: boolean("status").notNull().default(true),               // true=发布, false=草稿
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("page_contents_slug_idx").on(table.slug),
  })
);

// ── 用户偏好设置 ──

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pageKey: varchar("page_key", { length: 100 }).notNull(),
    filters: jsonb("filters").notNull().default("{}"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userPageIdx: uniqueIndex("user_prefs_user_page_idx").on(table.userId, table.pageKey),
  })
);

// ── 公告 ──

export const announcements = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull(),
    type: varchar("type", { length: 50 }).notNull().default("system_announcement"),
    status: boolean("status").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    createdBy: integer("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("announcements_status_idx").on(table.status),
    createdAtIdx: index("announcements_created_at_idx").on(table.createdAt),
  })
);
