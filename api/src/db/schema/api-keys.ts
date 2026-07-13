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
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

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
  },
  (table) => ({
    hashIdx: uniqueIndex("api_keys_hash_idx").on(table.keyHash),
    userIdIdx: index("api_keys_user_id_idx").on(table.userId),
    statusIdx: index("api_keys_status_idx").on(table.status),
  })
);
