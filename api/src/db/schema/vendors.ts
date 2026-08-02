import { pgTable, serial, varchar, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";

/**
 * 供应商表
 * 对齐 supplement/07 §2.2 + ref-4.3-vendor-model.md
 */
export const vendors = pgTable(
  "vendors",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(), // 内部标识
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // 协议端点
    baseUrl: varchar("base_url", { length: 500 }),
    apiFormat: varchar("api_format", { length: 20 }).default("openai"), // openai / anthropic / custom
    apiAuthType: varchar("api_auth_type", { length: 20 }).default("api_key"), // api_key / bearer_token
    commissionRate: varchar("commission_rate", { length: 10 }).default("0.1000"),
    // 结算
    currency: varchar("currency", { length: 10 }).default("CNY"),
    contact: text("contact"), // JSON: { name, email, phone }
    // 供应商自助登录
    contactEmail: varchar("contact_email", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    rejectReason: text("reject_reason"),
    // 健康度（0-100，由监控聚合）
    healthScore: text("health_score"), // 保留扩展
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_vendors_status").on(table.status)],
);

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
