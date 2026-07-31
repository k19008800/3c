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
  bigint,
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
    // 定时发布时间，NULL 表示立即发布
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // 是否已发布，定时发布时在 scheduled_at 到期后自动设置为 TRUE
    isPublished: boolean("is_published").notNull().default(true),
    createdBy: integer("created_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("announcements_status_idx").on(table.status),
    createdAtIdx: index("announcements_created_at_idx").on(table.createdAt),
    // 定时发布查询索引
    scheduledPublishIdx: index("announcements_scheduled_publish_idx").on(table.scheduledAt),
  })
);

// ── 隐私政策版本 ──

export const privacyPolicyVersions = pgTable(
  "privacy_policy_versions",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 }).notNull(),
    title: varchar("title", { length: 200 }),
    content: text("content").notNull(),
    summary: text("summary"),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft / published
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("ppv_status_idx").on(table.status),
  })
);

// ── 用户隐私政策同意记录 ──

export const userPrivacyConsents = pgTable(
  "user_privacy_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    versionId: integer("version_id").notNull().references(() => privacyPolicyVersions.id, { onDelete: "cascade" }),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    ip: varchar("ip", { length: 45 }),
  },
  (table) => ({
    userVersionIdx: uniqueIndex("upc_user_version_idx").on(table.userId, table.versionId),
    userIdx: index("upc_user_idx").on(table.userId),
  })
);

// ── 服务条款版本 ──

export const termsOfServiceVersions = pgTable(
  "terms_of_service_versions",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 }).notNull(),
    title: varchar("title", { length: 200 }),
    content: text("content").notNull(),
    summary: text("summary"),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft / published
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("tosv_status_idx").on(table.status),
  })
);

// ── 用户服务条款同意记录 ──

export const userTosConsents = pgTable(
  "user_tos_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    versionId: integer("version_id").notNull().references(() => termsOfServiceVersions.id, { onDelete: "cascade" }),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    ip: varchar("ip", { length: 45 }),
  },
  (table) => ({
    userVersionIdx: uniqueIndex("utc_user_version_idx").on(table.userId, table.versionId),
    userIdx: index("utc_user_idx").on(table.userId),
  })
);

// ── 公告阅读记录 ──

export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // 唯一约束：同一用户对同一公告只记录一次
    userAnnouncementIdx: uniqueIndex("announcement_reads_user_announcement_idx").on(table.userId, table.announcementId),
    // 用户索引：快速查询某用户的所有已读公告
    userIdIdx: index("announcement_reads_user_id_idx").on(table.userId),
    // 公告索引：快速查询某公告的所有已读用户
    announcementIdIdx: index("announcement_reads_announcement_id_idx").on(table.announcementId),
  })
);

// ── 操作类型（审计日志操作类型管理） ──

export const operationTypes = pgTable(
  "operation_types",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),        // 操作类型名称（唯一）
    category: operationCategoryEnum("category").notNull(),          // 分类：auth/api_key/finance/profile/agent/system
    description: text("description"),                               // 描述说明
    enabled: boolean("enabled").notNull().default(true),           // 是否启用
    isSystem: boolean("is_system").notNull().default(false),       // 是否系统内置（不可删除）
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("operation_types_name_idx").on(table.name),
    categoryIdx: index("operation_types_category_idx").on(table.category),
    enabledIdx: index("operation_types_enabled_idx").on(table.enabled),
  })
);

// ── 数据导出请求（§33.3）──
export const dataExportRequests = pgTable("data_export_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  processedBy: integer("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  fileUrl: text("file_url"),
  fileExpiresAt: timestamp("file_expires_at", { withTimezone: true }),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  errorMessage: text("error_message"),
  rejectReason: text("reject_reason"),
});
