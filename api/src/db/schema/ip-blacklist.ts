import { pgTable, serial, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 系统级 IP 黑名单（P2-4，对齐 kb/3cloud/admin-security-ip-blacklist.md）
 *
 * 管理端 CRUD + 网关 onRequest 强制拦截（/v1/* 请求前查，命中 403）。
 * 支持单 IP 与 CIDR 网段；scope 控制拦截范围（api/admin/all）；
 * expires_at 过期自动失效（status 仍为 active 但过期不命中，管理端可续期/解禁）。
 *
 * @see kb/3cloud/admin-security-ip-blacklist.md
 * @see docs/iteration-plan-v2.md P2-4
 */
export const ipBlacklist = pgTable('ip_blacklist', {
  id: serial('id').primaryKey(),
  /** 单个 IP 或 CIDR 网段（IPv4/IPv6），如 192.168.1.1 / 192.168.1.0/24 */
  ip: varchar('ip', { length: 45 }).notNull(),
  /** 'single' | 'cidr' */
  type: varchar('type', { length: 20 }).notNull().default('single'),
  /** 封禁原因：暴力枚举 / CC 攻击 / 爬虫盗刷 / 风控触发 / 手动添加（可自定义） */
  reason: varchar('reason', { length: 200 }),
  /** 来源：manual / risk / apikey / import */
  source: varchar('source', { length: 50 }).notNull().default('manual'),
  /** 拦截范围：'api'（仅 API 调用）/ 'admin'（仅管理后台）/ 'all' */
  scope: varchar('scope', { length: 20 }).notNull().default('api'),
  /** 'active' 封禁中 / 'unblocked' 已解禁 */
  status: varchar('status', { length: 20 }).notNull().default('active'),
  /** 封禁操作人（admin 用户 id；null = 系统自动） */
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  /** 过期时间；null = 永久封禁 */
  expiresAt: timestamp('expires_at'),
  /** 备注（可选） */
  remark: text('remark'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  /** 网关拦截高频查询：status=active 且未过期（scope 过滤在应用层） */
  activeStatusIdx: index('idx_ip_blacklist_active').on(table.status, table.expiresAt),
}));
