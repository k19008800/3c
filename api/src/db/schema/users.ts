// ============================================================
//  3cloud (3C) — 用户 & 鉴权
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
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  userTypeEnum,
  userStatusEnum,
  realNameStatusEnum,
  userRoleEnum,
  oauthProviderEnum,
} from "./enums.js";

// ── 用户表 ──

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
    realNameStatusIdx: index("users_real_name_status_idx").on(table.realNameStatus),
  })
);

// ── 后台管理员账户 ──

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

// ── 用户角色变更历史 ──

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

// ── OAuth 绑定 ──

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

// ── 登录历史 ──

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

// ── 用户备注 ──

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

// ── 用户 IP 白名单 ──

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

// ── 实名审核历史 ──

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
