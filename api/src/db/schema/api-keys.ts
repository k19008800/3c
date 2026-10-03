import { pgTable, serial, integer, varchar, pgEnum, timestamp, jsonb, text } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const apiKeyStatusEnum = pgEnum('api_key_status', [
  'active',
  'disabled',
  'revoked',
]);

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  status: apiKeyStatusEnum('status').notNull().default('active'),
  scopes: jsonb('scopes').$type<string[]>().default([]),
  rateLimitPerMinute: integer('rate_limit_per_minute').default(60),
  // ── Key 细粒度权限（§20.4，P0）──
  // 数组列均为 nullable：NULL/空 = 不限制（向后兼容，未配置的 Key 全部放通）。
  // 模型白名单：非空时仅允许列表内模型；与 blockedModels 同时配置时黑名单优先。
  allowedModels: text('allowed_models').array(),
  // 模型黑名单：列表内模型一律 403（优先级高于白名单）。
  blockedModels: text('blocked_models').array(),
  // IP 白名单：非空时仅允许列表内来源 IP（支持 IPv4 单地址或 CIDR）。
  allowedIps: text('allowed_ips').array(),
  // Referer 白名单：非空时请求头 Referer 须包含列表中某条（子串匹配，按 origin 配）。
  allowedReferers: text('allowed_referers').array(),
  // 日 Token 上限（按 Key 维度，UTC 自然日）；NULL = 不限。
  dailyTokenLimit: integer('daily_token_limit'),
  // 每分钟请求数上限（按 Key 维度，60s 窗口）；NULL = 不限。
  rpmLimit: integer('rpm_limit'),
  // 每分钟 Token 上限（按 Key 维度，60s 窗口）；NULL = 不限。
  tpmLimit: integer('tpm_limit'),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
