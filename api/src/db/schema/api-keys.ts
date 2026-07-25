// ============================================================
//  3cloud (3C) — 用户 API Key
// ============================================================

import {
  pgTable,
  serial,
  integer,
  numeric,
  varchar,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// ── 权限类型定义 ──

/**
 * 时间段配置
 */
interface TimeRestriction {
  startHour?: number; // 0-23
  endHour?: number;   // 0-23
  weekdays?: number[]; // 0-6 (0=周日)
}

/**
 * 额度限制配置
 */
interface QuotaRestrictions {
  dailyLimit?: number; // 每日额度（单位：分）
  monthlyLimit?: number; // 每月额度（单位：分）
  perRequestLimit?: number; // 单次请求最大额度（单位：分）
}

/**
 * API Key 权限配置
 * - allowedModels: 允许访问的模型列表，null/空数组表示不限制
 * - ipWhitelist: IP 白名单，null/空数组表示不限制
 * - ipBlacklist: IP 黑名单，null/空数组表示不限制
 * - allowedEndpoints: 允许的端点列表，null/空数组表示不限制
 * - rateLimitPerMinute: 每分钟请求限制，null 表示使用系统默认
 * - timeRestrictions: 时间段限制
 * - quotaRestrictions: 额度限制
 * - requireModelCheck: 是否强制检查模型权限
 */
export interface ApiKeyPermissions {
  allowedModels?: string[] | null;
  ipWhitelist?: string[] | null;
  ipBlacklist?: string[] | null;
  allowedEndpoints?: string[] | null;
  rateLimitPerMinute?: number | null;
  timeRestrictions?: TimeRestriction | null;
  quotaRestrictions?: QuotaRestrictions | null;
  requireModelCheck?: boolean | null;
}

// ── 用户 API Key ──

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
    quotaBalance: numeric("quota_balance", { precision: 18, scale: 6 }), // Key 独立额度，NULL=不限制
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // ── 权限控制字段 ──
    permissions: jsonb("permissions").$type<ApiKeyPermissions>(), // 权限配置
    templateId: integer("template_id"), // 关联的权限模板 ID
  },
  (table) => ({
    hashIdx: uniqueIndex("api_keys_hash_idx").on(table.keyHash),
    userIdIdx: index("api_keys_user_id_idx").on(table.userId),
    statusIdx: index("api_keys_status_idx").on(table.status),
    templateIdx: index("api_keys_template_idx").on(table.templateId),
  })
);

// ── API Key 权限模板 ──

export const apiKeyPermissionTemplates = pgTable(
  "api_key_permission_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }),
    permissions: jsonb("permissions").$type<ApiKeyPermissions>().notNull(),
    isSystem: boolean("is_system").notNull().default(false), // 系统预设模板不可删除
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("api_key_templates_name_idx").on(table.name),
  })
);
