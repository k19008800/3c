import { pgTable, serial, integer, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { vendors } from "./vendors";

/**
 * 供应商 API Key 池
 * 对齐 supplement/07 §2.2：一个供应商可有多个 key，路由时轮换
 * Phase 1 先支持单个 key（默认取 enabled 第一个），§25 扩展 key 池
 */
export const vendorApiKeys = pgTable(
  "vendor_api_keys",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
    // 加密存储的供应商 key（运行时解密）
    encryptedKey: varchar("encrypted_key", { length: 500 }).notNull(),
    // 仅存前缀便于展示
    keyPrefix: varchar("key_prefix", { length: 20 }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    // 使用状态（key 池轮换）
    lastUsedAt: timestamp("last_used_at"),
    failedCount: integer("failed_count").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_vendor_api_keys_vendor").on(table.vendorId)],
);

export type VendorApiKey = typeof vendorApiKeys.$inferSelect;
export type NewVendorApiKey = typeof vendorApiKeys.$inferInsert;
