// ============================================================
//  3cloud (3C) — 模型 & 厂商
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
import { sql } from "drizzle-orm";

import {
  modelTypeEnum,
  vendorStatusEnum,
  circuitStateEnum,
} from "./enums.js";
import { users } from "./users.js";

// ── 供应商 ──

export const vendors = pgTable(
  "vendors",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    baseUrl: varchar("base_url", { length: 500 }).notNull(),
    status: vendorStatusEnum("status").notNull().default("active"),
    description: text("description"),
    // 供应商自助注册字段
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    companyName: varchar("company_name", { length: 255 }),
    contactName: varchar("contact_name", { length: 100 }),
    contactPhone: varchar("contact_phone", { length: 20 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("vendors_name_idx").on(table.name),
    userIdIdx: index("vendors_user_id_idx").on(table.userId),
  })
);

// ── 模型定义 ──

export const models = pgTable(
  "models",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),     // 统一模型名，如 deepseek-v4-pro
    displayName: varchar("display_name", { length: 200 }),         // 前端展示名
    type: modelTypeEnum("type").notNull().default("chat"),
    description: text("description"),
    status: boolean("status").notNull().default(true),             // true=上架, false=下架
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("models_name_idx").on(table.name),
    typeStatusIdx: index("models_type_status_idx").on(table.type, table.status),
  })
);

// ── 供应商-模型映射 ──

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

    // 熔断器增强（DB 持久化状态）
    circuitState: circuitStateEnum("circuit_state").notNull().default("closed"),
    circuitOpenedAt: timestamp("circuit_opened_at", { withTimezone: true }),
    circuitRetryAfter: timestamp("circuit_retry_after", { withTimezone: true }),
    circuitFailCount: integer("circuit_fail_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vendorModelIdx: uniqueIndex("vendor_models_vendor_model_idx").on(table.vendorId, table.modelId).where(sql`status = true`),
    modelIdIdx: index("vendor_models_model_id_idx").on(table.modelId),
    vendorDownIdx: index("vendor_models_vendor_down_idx").on(table.vendorId, table.isDown),
  })
);

// ── 供应商 API Key（供应商自助管理） ──

export const vendorApiKeys = pgTable(
  "vendor_api_keys",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
    permissions: jsonb("permissions").notNull().default(["vendor:*"]),
    status: boolean("status").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashIdx: uniqueIndex("vendor_api_keys_hash_idx").on(table.keyHash),
    vendorIdIdx: index("vendor_api_keys_vendor_id_idx").on(table.vendorId),
  })
);
