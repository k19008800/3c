import { pgTable, serial, varchar, text, timestamp, boolean, integer, numeric, index } from "drizzle-orm/pg-core";

/**
 * 供应商表
 * 对齐 supplement/07 §2.2 + ref-4.3-vendor-model.md + ref-4.10-vendor-self-service.md
 * 支持供应商自助注册/登录（contact_email + password_hash）
 */
export const vendors = pgTable(
  "vendors",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(), // 内部标识
    status: varchar("status", { length: 20 }).notNull().default("active"), // pending/active/maintenance/offline/rejected
    // 协议端点
    baseUrl: varchar("base_url", { length: 500 }),
    apiFormat: varchar("api_format", { length: 20 }).default("openai"), // openai / anthropic / custom
    // 结算
    currency: varchar("currency", { length: 10 }).default("CNY"),
    contact: text("contact"), // JSON: { name, email, phone }
    // 健康度（0-100，由监控聚合）
    healthScore: text("health_score"), // 保留扩展
    isActive: boolean("is_active").default(true),
    // 供应商自助入驻/登录字段（ref-4.10 §4.1）
    contactEmail: varchar("contact_email", { length: 255 }).unique(), // 登录账号
    passwordHash: varchar("password_hash", { length: 255 }),
    contactName: varchar("contact_name", { length: 100 }),
    contactPhone: varchar("contact_phone", { length: 20 }),
    apiAuthType: varchar("api_auth_type", { length: 20 }).default("bearer_token"), // bearer_token / api_key
    rejectReason: text("reject_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: integer("reviewed_by"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }).default("0.1000"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_vendors_status").on(table.status)],
);

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
