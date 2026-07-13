// ============================================================
//  3cloud (3C) — 管理后台 API Key
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { adminApiKeyStatusEnum } from "./enums.js";
import { users } from "./users.js";

// ── 管理后台 API Key ──

export const adminApiKeys = pgTable(
  "admin_api_keys",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
    permissions: jsonb("permissions").notNull().default("[]"),
    status: adminApiKeyStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdBy: integer("created_by")
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashIdx: uniqueIndex("admin_api_keys_hash_idx").on(table.keyHash),
    statusIdx: index("admin_api_keys_status_idx").on(table.status),
  })
);

// ── 管理 API Key 使用日志 ──

export const adminKeyUsageLogs = pgTable(
  "admin_key_usage_logs",
  {
    id: serial("id").primaryKey(),
    keyId: integer("key_id")
      .notNull()
      .references(() => adminApiKeys.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 10 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdIdx: index("admin_key_usage_logs_key_id_idx").on(table.keyId),
    keyCreatedAtIdx: index("admin_key_usage_logs_key_created_at_idx").on(table.keyId, table.createdAt.desc()),
  })
);
