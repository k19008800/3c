/**
 * 渠道（供应商）自助门户表 — §25 渠道增强（P1 vendor self-service portal）
 *
 * 与用户 JWT 体系完全隔离：渠道方用独立账号密码登录，签发 purpose='vendor' 的独立令牌。
 *
 * - vendor_accounts：渠道登录凭据（一个 supplier 一个登录账号，email 唯一）
 * - vendor_notifications：渠道公告（supplier_id 为空 = 广播给全部渠道）
 * - vendor_settlement_requests：渠道自助结算申请（§25.4，平台审核后打款）
 *
 * 既有供应商结算单（vendor_settlements）由管理员侧生成/确认/打款，本门户只读展示 + 发起申请。
 *
 * @module db/schema/vendor-portal
 * @see docs/SPEC-§25-供应商增强.md
 * @see docs/ref-25-vendor-enhance.md
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { suppliers } from './suppliers.js';

/**
 * 渠道登录账号 — 一个供应商（supplier）对应一个自助门户登录账号。
 *
 * 认证与用户 JWT 分离：令牌 payload 带 purpose='vendor'，用户令牌无此字段，交叉使用即无效。
 */
export const vendorAccounts = pgTable(
  'vendor_accounts',
  {
    id: serial('id').primaryKey(),
    /** 所属供应商（suppliers.id），一个供应商仅一个登录账号 */
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    /** 登录邮箱（唯一） */
    email: varchar('email', { length: 255 }).notNull(),
    /** bcrypt 密码哈希（bcryptjs.hashSync(pw, 12)） */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    /** active | disabled（冻结后禁止登录） */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    /** 最近一次登录时间 */
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex('uq_vendor_accounts_email').on(table.email),
    supplierUnique: uniqueIndex('uq_vendor_accounts_supplier').on(table.supplierId),
  }),
);

/**
 * 渠道公告 — 平台向渠道推送 API 变更 / 结算通知 / 新模型上线 / 系统维护。
 *
 * supplier_id 为空 = 广播给所有渠道；非空 = 仅该渠道可见。
 */
export const vendorNotifications = pgTable(
  'vendor_notifications',
  {
    id: serial('id').primaryKey(),
    /** 目标渠道（suppliers.id）；null = 广播全部渠道 */
    supplierId: integer('supplier_id').references(() => suppliers.id),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content').notNull(),
    /** general | price_change | maintenance | upgrade | incident */
    category: varchar('category', { length: 30 }).notNull().default('general'),
    /** low | normal | high */
    priority: varchar('priority', { length: 10 }).notNull().default('normal'),
    /** 置顶（列表最前） */
    isPinned: boolean('is_pinned').notNull().default(false),
    /** 发布管理员 user id */
    createdBy: integer('created_by'),
    /** 过期时间（过期后渠道端不可见） */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    supplierIdx: index('idx_vendor_notifications_supplier').on(table.supplierId),
    createdAtIdx: index('idx_vendor_notifications_created_at').on(table.createdAt),
  }),
);

/**
 * 渠道自助结算申请 — §25.4。渠道主动发起，平台审核后打款。
 *
 * 状态流转：pending → approved / rejected；渠道可撤回 → cancelled。
 * 资格：待结算金额 ≥ 最低结算额、当前无 pending 申请、渠道状态 active。
 */
export const vendorSettlementRequests = pgTable(
  'vendor_settlement_requests',
  {
    id: serial('id').primaryKey(),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    /** 申请账期 YYYY-MM（可空，表示累计未结算） */
    period: varchar('period', { length: 7 }),
    /** 申请时预估金额（元，numeric(18,4)） */
    estimatedAmount: numeric('estimated_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    /** pending | approved | rejected | cancelled */
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** 驳回原因（rejected 时由管理员填写） */
    rejectReason: text('reject_reason'),
    /** 审核管理员 user id */
    processedBy: integer('processed_by'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    supplierIdx: index('idx_vendor_settlement_requests_supplier').on(table.supplierId),
    statusIdx: index('idx_vendor_settlement_requests_status').on(table.status),
  }),
);

export type VendorAccount = typeof vendorAccounts.$inferSelect;
export type NewVendorAccount = typeof vendorAccounts.$inferInsert;
export type VendorNotification = typeof vendorNotifications.$inferSelect;
export type NewVendorNotification = typeof vendorNotifications.$inferInsert;
export type VendorSettlementRequest = typeof vendorSettlementRequests.$inferSelect;
export type NewVendorSettlementRequest = typeof vendorSettlementRequests.$inferInsert;
