import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  timestamp,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * API Key 表
 * 对齐 supplement/07-Schema重设计建议.md + ref-2.2.3-api-keys.md
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    name: varchar("name", { length: 100 }).notNull(),
    // 仅存 Key 前缀 + 哈希，不存明文
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // 模型权限（逗号分隔模型名，空=全部）
    modelWhitelist: text("model_whitelist"),
    // 细粒度权限（对齐 §30.4 / §20.4）
    ipWhitelist: text("ip_whitelist"), // JSON array of IP/CIDR
    domainWhitelist: text("domain_whitelist"), // JSON array of domains
    dailyCallLimit: integer("daily_call_limit"),
    dailyTokenLimit: bigint("daily_token_limit", { mode: "number" }),
    dailyCostLimit: integer("daily_cost_limit"), // 分
    // 过期时间
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    deletedAt: timestamp("deleted_at"), // 软删除
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_api_keys_user").on(table.userId),
    index("idx_api_keys_hash").on(table.keyHash),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
