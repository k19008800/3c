// ============================================================
//  3cloud (3C) — Drizzle ORM Schema (PostgreSQL)
//  Version: V3.4
//  Aligned with PRD-完整版.md V3.4 — 2026-06-27
//  Changes: status enum (drop pending_review, add deleted),
//  disabled_reason/by/at/until fields, call_logs partition notes
// ============================================================
//  Numeric convention: DECIMAL(18,6) for all monetary fields
//  Timestamp convention: TIMESTAMP WITH TIME ZONE (UTC)
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
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────
//  Enums
// ──────────────────────────────────────────────

export const userTypeEnum = pgEnum("user_type", ["personal", "enterprise"]);
export const oauthProviderEnum = pgEnum("oauth_provider", [
  "wechat",
  "google",
  "apple",
  "github",
]);
export const userStatusEnum = pgEnum("user_status", [
  "pending",        // 未验证邮箱
  "active",         // 已验证邮箱
  "disabled",       // 已禁用（可登录看余额，不可请求）
  "deleted",        // 已注销（软删除，不可登录不可重新注册）
]);
export const realNameStatusEnum = pgEnum("real_name_status", [
  "unverified",
  "pending_review",
  "approved",
  "rejected",
]);
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "finance_ops",
  "ops",
  "support",
  "auditor",
  "agent",
  "user",
]);
export const teamRoleEnum = pgEnum("team_role", [
  "team_owner",
  "team_admin",
  "team_member",
]);
export const modelTypeEnum = pgEnum("model_type", [
  "chat",
  "embedding",
  "image",
  "audio",
]);
export const vendorStatusEnum = pgEnum("vendor_status", [
  "active",
  "down",    // 宕机（被动检测）
  "degraded",// 降级
  "disabled",
]);
export const callStatusEnum = pgEnum("call_status", ["success", "failed", "timeout", "cancelled"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "cancelled",
  "confirmed",   // 对公转账已确认
  "refunded",
]);
export const payChannelEnum = pgEnum("pay_channel", [
  "wechat_scan",
  "wechat_jsapi",
  "alipay_scan",
  "alipay_jsapi",
  "bank_transfer",
]);
export const withdrawStatusEnum = pgEnum("withdraw_status", [
  "pending_first_review",
  "pending_second_review",
  "approved",
  "rejected",
  "paid",
]);
export const commissionStatusEnum = pgEnum("commission_status", [
  "pending",
  "settled",
  "cancelled",
]);
export const balanceLogTypeEnum = pgEnum("balance_log_type", [
  "recharge",
  "consumption",
  "refund",
  "trial_grant",
  "admin_adjust",
  "negative_repay",
]);
export const auditActionEnum = pgEnum("audit_action", [
  "user_create",
  "user_disable",
  "user_enable",
  "user_password_reset",
  "balance_adjust",
  "role_change",
  "real_name_approve",
  "real_name_reject",
  "withdraw_approve",
  "withdraw_reject",
  "withdraw_first_approve",
  "withdraw_second_approve",
  "withdraw_paid",
  "agent_create",
  "agent_update",
  "config_update",
  "vendor_create",
  "vendor_update",
  "model_create",
  "model_update",
  "user_update",
  "user_impersonate",
  "order_cancel",
  "recharge_confirm",
  "recharge_first_confirm",
  "recharge_second_confirm",
  "system_maintenance",
]);

// ──────────────────────────────────────────────
//  5.1 用户 & 鉴权
// ──────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    nickname: varchar("nickname", { length: 100 }),
    userType: userTypeEnum("user_type").notNull().default("personal"),
    role: userRoleEnum("role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("pending"),

    // 禁用信息（status=disabled 时有效）
    disabledReason: text("disabled_reason"),
    disabledBy: integer("disabled_by").references((): AnyPgColumn => users.id),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledUntil: timestamp("disabled_until", { withTimezone: true }), // NULL=永久

    // 实名
    realNameStatus: realNameStatusEnum("real_name_status").notNull().default("unverified"),
    realName: varchar("real_name", { length: 100 }),
    idNumber: varchar("id_number", { length: 30 }),
    idFrontImage: varchar("id_front_image", { length: 500 }),
    idBackImage: varchar("id_back_image", { length: 500 }),
    companyName: varchar("company_name", { length: 255 }),
    companyRegNumber: varchar("company_reg_number", { length: 50 }),
    businessLicense: varchar("business_license", { length: 500 }),
    bankName: varchar("bank_name", { length: 255 }),
    bankAccount: varchar("bank_account", { length: 100 }),
    bankAddress: varchar("bank_address", { length: 500 }),
    invoiceTitle: varchar("invoice_title", { length: 255 }),
    invoiceTaxId: varchar("invoice_tax_id", { length: 50 }),
    rejectReason: text("reject_reason"),

    // 余额 & 计费
    balance: numeric("balance", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).default("1.0000"),

    // 限流覆盖
    rpmOverride: integer("rpm_override"),
    tpmOverride: integer("tpm_override"),

    // 团队
    teamId: integer("team_id"),
    teamRole: teamRoleEnum("team_role"),

    // 安全控制
    loginCaptchaUntil: timestamp("login_captcha_until", { withTimezone: true }),
    maxConcurrentSessions: integer("max_concurrent_sessions"),  // NULL=使用系统默认
    forceLogoutAt: timestamp("force_logout_at", { withTimezone: true }),

    // 联系 & 头像
    phone: varchar("phone", { length: 20 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),

    // 时间
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),  // 软删除
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    statusIdx: index("users_status_idx").on(table.status),
    teamIdIdx: index("users_team_id_idx").on(table.teamId),
    realNameStatusIdx: index("users_real_name_status_idx").on(table.realNameStatus),
  })
);

export const adminAccounts = pgTable(
  "admin_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("admin"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    loginCount: integer("login_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("admin_accounts_user_id_idx").on(table.userId),
    roleIdx: index("admin_accounts_role_idx").on(table.role),
  })
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(), // SHA-256 哈希
    keyPrefix: varchar("key_prefix", { length: 10 }).notNull(), // 前 4 位用于展示
    status: boolean("status").notNull().default(true), // true=启用, false=禁用
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashIdx: uniqueIndex("api_keys_hash_idx").on(table.keyHash),
    userIdIdx: index("api_keys_user_id_idx").on(table.userId),
    statusIdx: index("api_keys_status_idx").on(table.status),
  })
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull(),
    role: teamRoleEnum("role").notNull().default("team_member"),
    quotaBalance: numeric("quota_balance", { precision: 18, scale: 6 }), // 成员独立额度上限
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("team_members_user_id_idx").on(table.userId), // 一人一队
    teamIdRoleIdx: index("team_members_team_id_role_idx").on(table.teamId, table.role),
  })
);

export const userRoleHistory = pgTable(
  "user_role_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    oldRole: userRoleEnum("old_role"),
    newRole: userRoleEnum("new_role").notNull(),
    operatorId: integer("operator_id")
      .references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_role_history_user_id_idx").on(table.userId),
    createdAtIdx: index("user_role_history_created_at_idx").on(table.createdAt),
  })
);

export const userOauthBindings = pgTable(
  "user_oauth_bindings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: oauthProviderEnum("provider").notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
    providerEmail: varchar("provider_email", { length: 255 }),
    nickname: varchar("nickname", { length: 100 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    rawProfile: jsonb("raw_profile"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userProviderIdx: uniqueIndex("user_oauth_user_provider_idx").on(table.userId, table.provider),
    providerUserIdx: uniqueIndex("user_oauth_provider_user_idx").on(table.provider, table.providerUserId),
  })
);

// ──────────────────────────────────────────────
//  5.1.1 安全 & 运营
// ──────────────────────────────────────────────

export const userLoginHistory = pgTable(
  "user_login_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 45 }).notNull(),
    userAgent: varchar("user_agent", { length: 500 }),
    success: boolean("success").notNull(),
    failReason: varchar("fail_reason", { length: 100 }),  // wrong_password / user_disabled / user_deleted
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("user_login_history_user_created_at_idx").on(table.userId, table.createdAt),
    createdAtIdx: index("user_login_history_created_at_idx").on(table.createdAt),
    cityIdx: index("user_login_history_city_idx").on(table.city),
  })
);

export const userNotes = pgTable(
  "user_notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_notes_user_id_idx").on(table.userId),
  })
);

export const userIpWhitelist = pgTable(
  "user_ip_whitelist",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 45 }).notNull(),
    description: varchar("description", { length: 255 }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIpIdx: uniqueIndex("user_ip_whitelist_user_id_ip_idx").on(table.userId, table.ip),
  })
);

// ──────────────────────────────────────────────
//  5.1.11 用户通知（站内信）
// ──────────────────────────────────────────────

export const notificationTypeEnum = pgEnum("notification_type", [
  "real_name_approved",
  "real_name_rejected",
  "system",
  "login_alert",
  "account_banned",
]);

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    refType: varchar("ref_type", { length: 50 }),
    refId: integer("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("user_notifications_user_id_created_at_idx").on(table.userId, table.createdAt),
    unreadIdx: index("user_notifications_unread_idx").on(table.userId, table.readAt),
  })
);

// ──────────────────────────────────────────────
//  5.1.2 实名审核历史
// ──────────────────────────────────────────────

export const userRealNameReviews = pgTable(
  "user_real_name_reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(), // 自增版本号（按用户）
    // 提交的实名信息快照
    realName: varchar("real_name", { length: 100 }),
    idNumber: varchar("id_number", { length: 30 }),
    idFrontImage: varchar("id_front_image", { length: 500 }),
    idBackImage: varchar("id_back_image", { length: 500 }),
    companyName: varchar("company_name", { length: 255 }),
    companyRegNumber: varchar("company_reg_number", { length: 50 }),
    businessLicense: varchar("business_license", { length: 500 }),
    bankName: varchar("bank_name", { length: 255 }),
    bankAccount: varchar("bank_account", { length: 100 }),
    bankAddress: varchar("bank_address", { length: 500 }),
    invoiceTitle: varchar("invoice_title", { length: 255 }),
    invoiceTaxId: varchar("invoice_tax_id", { length: 50 }),
    ocrResult: jsonb("ocr_result"),
    // 审核结果
    status: realNameStatusEnum("status").notNull().default("pending_review"),
    reviewerId: integer("reviewer_id").references(() => users.id),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => ({
    userIdVersionIdx: uniqueIndex("user_real_name_user_version_idx").on(table.userId, table.version),
    userIdIdx: index("user_real_name_user_id_idx").on(table.userId),
    statusIdx: index("user_real_name_status_idx").on(table.status),
  })
);

// ──────────────────────────────────────────────
//  5.2 模型 & 厂商
// ──────────────────────────────────────────────

export const vendors = pgTable(
  "vendors",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    baseUrl: varchar("base_url", { length: 500 }).notNull(),
    status: vendorStatusEnum("status").notNull().default("active"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("vendors_name_idx").on(table.name),
  })
);

export const models = pgTable(
  "models",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),     // 统一模型名，如 deepseek-v4-pro
    displayName: varchar("display_name", { length: 200 }),         // 前端展示名
    type: modelTypeEnum("type").notNull().default("chat"),
    status: boolean("status").notNull().default(true),             // true=上架, false=下架
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("models_name_idx").on(table.name),
    typeStatusIdx: index("models_type_status_idx").on(table.type, table.status),
  })
);

export const vendorModels = pgTable(
  "vendor_models",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    modelId: integer("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    upstreamModelName: varchar("upstream_model_name", { length: 200 }).notNull(), // 上游真实模型名（硬映射）
    apiEndpoint: varchar("api_endpoint", { length: 500 }).notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),          // AES-256-GCM 加密
    costPriceInput: numeric("cost_price_input", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    costPriceOutput: numeric("cost_price_output", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    sellPriceInput: numeric("sell_price_input", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    sellPriceOutput: numeric("sell_price_output", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    weight: integer("weight").notNull().default(100),
    rpmLimit: integer("rpm_limit"),                                // 厂商端 RPM 上限
    tpmLimit: integer("tpm_limit"),                                // 厂商端 TPM 上限
    status: boolean("status").notNull().default(true),

    // 健康状态（被动检测）
    healthScore: numeric("health_score", { precision: 5, scale: 2 }).default("1.00"), // 0.00~1.00
    healthSamples: integer("health_samples").default(0),           // 最近采样次数
    consecutiveSuccess: integer("consecutive_success").default(0), // 主动检测连续成功次数
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    isDown: boolean("is_down").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vendorModelIdx: uniqueIndex("vendor_models_vendor_model_idx").on(table.vendorId, table.modelId).where(sql`status = true`),
    modelIdIdx: index("vendor_models_model_id_idx").on(table.modelId),
    vendorDownIdx: index("vendor_models_vendor_down_idx").on(table.vendorId, table.isDown),
  })
);

// ──────────────────────────────────────────────
//  5.3 计费 & 交易
// ──────────────────────────────────────────────

// ── call_logs: PG 原生表分区（PARTITION BY RANGE created_at），按月分区  ──
// 每个分区内建以下索引：
//   (user_id, created_at DESC)
//   (api_key_id, created_at DESC)
//   (vendor, created_at DESC)
//   (status, created_at DESC)
// 90 天后 DROP 旧分区。
// Drizzle schema 仅定义父表结构；分区创建由 src/db/migrations/partition-call-logs.sql 执行。

// ── call_logs — 父表（分区表 | 实际分区由 SQL 迁移创建）        ──
// PG 分区要求：PRIMARY KEY 必须包含分区列。
// 分区创建脚本：src/db/migrations/setup-call-logs-partitions.ts
// 保留 90 天，之后 DROP 旧分区。

export const callLogs = pgTable(
  "call_logs",
  {
    id: serial("id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    apiKeyId: integer("api_key_id")
      .references(() => apiKeys.id),
    modelId: integer("model_id")
      .references(() => models.id),
    vendorModelId: integer("vendor_model_id")
      .references(() => vendorModels.id),
    vendorName: varchar("vendor_name", { length: 100 }),
    modelName: varchar("model_name", { length: 100 }),

    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cost: numeric("cost", { precision: 18, scale: 6 }).notNull().default("0.000000"),

    durationMs: integer("duration_ms"),
    status: callStatusEnum("status").notNull(),
    errorMessage: text("error_message"),

    isStreaming: boolean("is_streaming").notNull().default(false),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // 复合 PK（分区列必须在 PK 中）
    pk: primaryKey({ columns: [table.id, table.createdAt] }),

    // 分区内索引
    userCreatedAtIdx: index("call_logs_user_created_at_idx").on(table.userId, table.createdAt),
    apiKeyCreatedAtIdx: index("call_logs_api_key_created_at_idx").on(table.apiKeyId, table.createdAt),
    vendorCreatedAtIdx: index("call_logs_vendor_created_at_idx").on(table.vendorName, table.createdAt),
    statusCreatedAtIdx: index("call_logs_status_created_at_idx").on(table.status, table.createdAt),
    modelNameCreatedAtIdx: index("call_logs_model_name_created_at_idx").on(table.modelName, table.createdAt.desc()),
    createdAtIdx: index("call_logs_created_at_idx").on(table.createdAt),
  })
);

export const rechargeOrders = pgTable(
  "recharge_orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    orderNo: varchar("order_no", { length: 64 }).notNull().unique(), // 业务订单号
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    channel: payChannelEnum("channel").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    // 在线支付
    channelOrderNo: varchar("channel_order_no", { length: 128 }),   // 微信/支付宝订单号
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // 对公转账
    voucherImage: varchar("voucher_image", { length: 500 }),        // 转账凭证图片
    confirmedBy: integer("confirmed_by").references(() => users.id),// 单次确认兼容
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // 增强财务字段
    voucherNo: varchar("voucher_no", { length: 32 }),
    payerAccountName: varchar("payer_account_name", { length: 128 }),
    payerAccountNo: varchar("payer_account_no", { length: 64 }),
    transferRemark: varchar("transfer_remark", { length: 256 }),
    bankTxId: varchar("bank_tx_id", { length: 64 }),
    bankTxCheckedAt: timestamp("bank_tx_checked_at", { withTimezone: true }),
    // 双审字段
    firstConfirmedBy: integer("first_confirmed_by").references(() => users.id),
    firstConfirmedAt: timestamp("first_confirmed_at", { withTimezone: true }),
    secondConfirmedBy: integer("second_confirmed_by").references(() => users.id),
    secondConfirmedAt: timestamp("second_confirmed_at", { withTimezone: true }),
    // 退款
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    // 过期
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    remark: text("remark"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderNoIdx: uniqueIndex("recharge_orders_order_no_idx").on(table.orderNo),
    userIdIdx: index("recharge_orders_user_id_idx").on(table.userId),
    userIdCreatedAtIdx: index("recharge_orders_user_created_at_idx").on(table.userId, table.createdAt.desc()),
    statusIdx: index("recharge_orders_status_idx").on(table.status),
  })
);

export const balanceLogs = pgTable(
  "balance_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 18, scale: 6 }).notNull(),
    type: balanceLogTypeEnum("type").notNull(),
    refType: varchar("ref_type", { length: 50 }),                   // 关联类型：order / call / adjust
    refId: integer("ref_id"),                                       // 关联 ID
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("balance_logs_user_created_at_idx").on(table.userId, table.createdAt),
    typeIdx: index("balance_logs_type_idx").on(table.type),
  })
);

export const userDiscounts = pgTable(
  "user_discounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).notNull().default("1.0000"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_discounts_user_id_idx").on(table.userId),
  })
);

// ──────────────────────────────────────────────
//  5.4 代理商
// ──────────────────────────────────────────────

export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    totalCommission: numeric("total_commission", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    settledCommission: numeric("settled_commission", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    pendingWithdraw: numeric("pending_withdraw", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    frozenAmount: numeric("frozen_amount", { precision: 18, scale: 6 }).notNull().default("0.000000"),
    status: boolean("status").notNull().default(true),
    // 团队层级
    parentAgentId: integer("parent_agent_id").references((): AnyPgColumn => agents.id),
    teamDepth: integer("team_depth").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("agents_user_id_idx").on(table.userId),
    parentIdx: index("agents_parent_idx").on(table.parentAgentId),
  })
);

export const agentClients = pgTable(
  "agent_clients",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    clientUserId: integer("client_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("agent_clients_agent_id_idx").on(table.agentId),
    clientIdx: uniqueIndex("agent_clients_client_idx").on(table.clientUserId),
  })
);

export const commissionLogs = pgTable(
  "commission_logs",
  {
    id: serial("id").notNull(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    clientCallLogId: integer("client_call_log_id"),
    // 注：client_call_log_id 无 FK 约束，因为 call_logs 是分区表且 PK 为 (id, created_at)。
    // 引用完整性由应用层确保。
    callCost: numeric("call_cost", { precision: 18, scale: 6 }).notNull(),
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 6 }).notNull(),
    status: commissionStatusEnum("status").notNull().default("pending"),
    // 增强字段
    voucherNo: varchar("voucher_no", { length: 32 }),
    commissionType: varchar("commission_type", { length: 20 }), // 'sale'|'team'|'activity'|'renewal'
    sourceOrderId: varchar("source_order_id", { length: 64 }),
    sourceOrderAmount: numeric("source_order_amount", { precision: 18, scale: 6 }),
    sourceCustomerId: integer("source_customer_id").references(() => users.id, { onDelete: "set null" }),
    feeRate: numeric("fee_rate", { precision: 5, scale: 4 }).default("0.0000"),
    feeAmount: numeric("fee_amount", { precision: 18, scale: 6 }).default("0.000000"),
    netAmount: numeric("net_amount", { precision: 18, scale: 6 }),
    ruleSnapshot: jsonb("rule_snapshot"),
    calcDetail: jsonb("calc_detail"),
    balanceSnapshot: numeric("balance_snapshot", { precision: 18, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    agentIdCreatedAtIdx: index("commission_logs_agent_id_created_at_idx").on(table.agentId, table.createdAt.desc()),
    statusCreatedAtIdx: index("commission_logs_status_created_at_idx").on(table.status, table.createdAt.desc()),
    agentIdStatusCreatedAtIdx: index("commission_logs_agent_status_date_idx").on(table.agentId, table.status, table.createdAt.desc()),
    voucherNoIdx: index("commission_logs_voucher_no_idx").on(table.voucherNo),
  })
);

export const agentCustomerConsumption = pgTable(
  "agent_customer_consumption",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    customerUserId: integer("customer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    customerName: varchar("customer_name", { length: 128 }),
    bindAt: timestamp("bind_at", { withTimezone: true }),
    totalAmount: numeric("total_amount", { precision: 18, scale: 6 }).default("0.000000"),
    monthAmount: numeric("month_amount", { precision: 18, scale: 6 }).default("0.000000"),
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 6 }).default("0.000000"),
    orderCount: integer("order_count").default(0),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentCustomerIdx: uniqueIndex("agent_consumption_agent_customer_idx").on(table.agentId, table.customerUserId),
    agentIdIdx: index("agent_consumption_agent_id_idx").on(table.agentId),
  })
);

// ──────────────────────────────────────────────
//  5.4.1 佣金规则配置表（每种佣金类型独立配置比例/条件/封顶）
// ──────────────────────────────────────────────

export const commissionRules = pgTable(
  "commission_rules",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    ruleType: varchar("rule_type", { length: 20 }).notNull(),
    // 'sale' | 'renewal' | 'team' | 'activity'

    rate: numeric("rate", { precision: 5, scale: 4 }).notNull().default("0.0000"),
    isEnabled: boolean("is_enabled").notNull().default(true),

    // 条件约束
    minTriggerAmount: numeric("min_trigger_amount", { precision: 18, scale: 6 }),
    maxCap: numeric("max_cap", { precision: 18, scale: 6 }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),

    // 活动专有
    activityName: varchar("activity_name", { length: 255 }),
    activityType: varchar("activity_type", { length: 50 }),
    fixedAmount: numeric("fixed_amount", { precision: 18, scale: 6 }),

    // 团队专有
    teamLevelLimit: integer("team_level_limit").default(1),

    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentTypeIdx: uniqueIndex("commission_rules_agent_type_idx").on(table.agentId, table.ruleType),
  })
);

// ──────────────────────────────────────────────
//  5.4.2 佣金日汇总（预聚合，用于分佣记录列表页，避免扫描分区表）
// ──────────────────────────────────────────────

export const commissionDailyRollup = pgTable(
  "commission_daily_rollup",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    reportDate: varchar("report_date", { length: 10 }).notNull(),

    // 汇总
    totalRecords: integer("total_records").notNull().default(0),
    totalCallCost: numeric("total_call_cost", { precision: 18, scale: 6 }).default("0.000000"),
    totalCommissionAmount: numeric("total_commission_amount", { precision: 18, scale: 6 }).default("0.000000"),
    totalFeeAmount: numeric("total_fee_amount", { precision: 18, scale: 6 }).default("0.000000"),
    totalNetAmount: numeric("total_net_amount", { precision: 18, scale: 6 }).default("0.000000"),

    // 按状态拆分
    pendingCount: integer("pending_count").default(0),
    settledCount: integer("settled_count").default(0),
    cancelledCount: integer("cancelled_count").default(0),
    pendingAmount: numeric("pending_amount", { precision: 18, scale: 6 }).default("0.000000"),
    settledAmount: numeric("settled_amount", { precision: 18, scale: 6 }).default("0.000000"),
    cancelledAmount: numeric("cancelled_amount", { precision: 18, scale: 6 }).default("0.000000"),

    // 按类型拆分
    saleCount: integer("sale_count").default(0),
    renewalCount: integer("renewal_count").default(0),
    activityCount: integer("activity_count").default(0),
    saleAmount: numeric("sale_amount", { precision: 18, scale: 6 }).default("0.000000"),
    renewalAmount: numeric("renewal_amount", { precision: 18, scale: 6 }).default("0.000000"),
    activityAmount: numeric("activity_amount", { precision: 18, scale: 6 }).default("0.000000"),

    // 代理商业绩快照
    agentTotalCommission: numeric("agent_total_commission", { precision: 18, scale: 6 }).default("0.000000"),
    agentSettledCommission: numeric("agent_settled_commission", { precision: 18, scale: 6 }).default("0.000000"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentDateIdx: uniqueIndex("comm_rollup_agent_date_idx").on(table.agentId, table.reportDate),
    dateIdx: index("comm_rollup_date_idx").on(table.reportDate),
  })
);

export const withdrawOrders = pgTable(
  "withdraw_orders",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    wechatPayNo: varchar("wechat_pay_no", { length: 128 }),          // 微信企业付款单号
    status: withdrawStatusEnum("status").notNull().default("pending_first_review"),
    // 增强财务字段
    voucherNo: varchar("voucher_no", { length: 32 }),
    feeAmount: numeric("fee_amount", { precision: 18, scale: 6 }).default("0.000000"),
    actualAmount: numeric("actual_amount", { precision: 18, scale: 6 }), // 实际到账 = amount - fee_amount
    bankCardNo: varchar("bank_card_no", { length: 64 }),
    bankName: varchar("bank_name", { length: 128 }),
    bankVoucherUrl: varchar("bank_voucher_url", { length: 512 }),
    riskCheckResult: jsonb("risk_check_result"),
    auditLevel: integer("audit_level"),
    // 双审字段
    firstAuditorId: integer("first_auditor_id").references(() => users.id),
    firstAuditedAt: timestamp("first_audited_at", { withTimezone: true }),
    secondAuditorId: integer("second_auditor_id").references(() => users.id),
    secondAuditedAt: timestamp("second_audited_at", { withTimezone: true }),
    paidOperatorId: integer("paid_operator_id").references(() => users.id),
    matchedBankTxId: integer("matched_bank_tx_id"),
    reviewedBy: integer("reviewed_by").references(() => users.id),  // 兼容保留
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("withdraw_orders_agent_id_idx").on(table.agentId),
    statusIdx: index("withdraw_orders_status_idx").on(table.status),
    voucherNoIdx: index("withdraw_orders_voucher_no_idx").on(table.voucherNo),
  })
);

// ──────────────────────────────────────────────
//  5.5 系统 & 安全
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  5.5.1 用户偏好设置
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  5.5 安全风控
// ──────────────────────────────────────────────

export const riskLevelEnum = pgEnum("risk_level", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const securityEventTypeEnum = pgEnum("security_event_type", [
  "brute_force",
  "unusual_location",
  "new_device",
  "ip_banned",
  "user_banned",
  "user_captcha",
  "circuit_trip",
  "circuit_recovery",
  "vendor_failure",
]);

export const loginSecurityConfigs = pgTable(
  "login_security_configs",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(),
    value: jsonb("value").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("login_security_configs_key_idx").on(table.key),
  })
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: securityEventTypeEnum("event_type").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    detail: jsonb("detail"),
    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("security_events_user_id_idx").on(table.userId),
    typeIdx: index("security_events_type_idx").on(table.eventType),
    createdAtIdx: index("security_events_created_at_idx").on(table.createdAt),
    riskIdx: index("security_events_risk_idx").on(table.riskLevel),
    unacknowledgedIdx: index("security_events_unack_idx").on(table.acknowledged),
  })
);

export const userLoginSessions = pgTable(
  "user_login_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
    ip: varchar("ip", { length: 45 }).notNull(),
    userAgent: varchar("user_agent", { length: 500 }),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    lastActivity: timestamp("last_activity", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(table.sessionToken),
    activeSessionIdx: index("sessions_active_idx").on(table.userId, table.isActive),
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
  })
);

// ══════════════════════════════════════════════════════════════
//  日对账汇总表（预计算 + 缓存）
// ══════════════════════════════════════════════════════════════

export const dailyReconSummary = pgTable(
  "daily_recon_summary",
  {
    id: serial("id").primaryKey(),
    reportDate: varchar("report_date", { length: 10 }).notNull().unique(),
    // 佣金
    commissionCount: integer("commission_count").notNull().default(0),
    commissionTotal: numeric("commission_total", { precision: 18, scale: 6 }).default("0.000000"),
    commissionFee: numeric("commission_fee", { precision: 18, scale: 6 }).default("0.000000"),
    commissionNet: numeric("commission_net", { precision: 18, scale: 6 }).default("0.000000"),
    // 提现
    withdrawCount: integer("withdraw_count").notNull().default(0),
    withdrawTotal: numeric("withdraw_total", { precision: 18, scale: 6 }).default("0.000000"),
    withdrawFee: numeric("withdraw_fee", { precision: 18, scale: 6 }).default("0.000000"),
    withdrawActual: numeric("withdraw_actual", { precision: 18, scale: 6 }).default("0.000000"),
    // 充值
    rechargeCount: integer("recharge_count").notNull().default(0),
    rechargeTotal: numeric("recharge_total", { precision: 18, scale: 6 }).default("0.000000"),
    // 抵扣消耗
    consumptionTotal: numeric("consumption_total", { precision: 18, scale: 6 }).default("0.000000"),
    // 资金平衡校验
    balanceDiff: numeric("balance_diff", { precision: 18, scale: 6 }).default("0.000000"),
    isBalanced: boolean("is_balanced").notNull().default(true),
    // 元数据
    version: integer("version").notNull().default(1),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportDateIdx: uniqueIndex("daily_recon_summary_date_idx").on(table.reportDate),
    balancedIdx: index("daily_recon_summary_balanced_idx").on(table.isBalanced),
  })
);

// ============================================================
//  Migration 种子数据（系统配置默认值）
// ============================================================

// System config default keys & values (insert on first deploy):
// Key                             | Value (JSON)
// ────────────────────────────────┼─────────────────────────────────────
// rate_limit_personal_rpm         | 60
// rate_limit_personal_tpm         | 100000
// rate_limit_enterprise_rpm       | 300
// rate_limit_enterprise_tpm       | 500000
// rate_limit_global_rpm           | 30
// rate_limit_global_tpm           | 50000
// alert_low_balance               | { "system": 50 }
// alert_stop_balance              | { "system": 10 }
// pricing_multiplier              | 1.33
// wechat_pay_app_id               | (config)
// wechat_pay_mch_id               | (config)
// wechat_pay_api_key              | (config)
// alipay_app_id                   | (config)
// alipay_private_key              | (config)
// email_smtp_host                 | (config)
// email_smtp_port                 | (config)
// email_smtp_user                 | (config)
// email_smtp_pass                 | (config)
// agent_daily_withdraw_limit      | 3
// trial_token_quota               | 50000
// trial_duration_days             | 7
// register_discount_rate          | 1.0000
// enterprise_discount_rate        | 0.9500
