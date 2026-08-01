import {
  pgTable, serial, integer, varchar, bigint, numeric, boolean, timestamp, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 客服临时测试 Key 对齐 SPEC-§28.2.3
 * 用于客服排查用户问题，不消耗用户余额，默认24h过期 + 配额限制
 */
export const staffTestKeys = pgTable(
  "staff_test_keys",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull().references(() => users.id),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }),
    associatedUserId: integer("associated_user_id"), // 为排查该用户问题生成
    tokenLimit: bigint("token_limit", { mode: "number" }).notNull().default(1000000),
    costLimit: numeric("cost_limit", { precision: 10, scale: 2 }).notNull().default("5.00"),
    usedTokens: bigint("used_tokens", { mode: "number" }).notNull().default(0),
    usedCost: numeric("used_cost", { precision: 10, scale: 2 }).notNull().default("0"),
    isTest: boolean("is_test").notNull().default(true), // 测试 Key 标记，网关放行不计费
    status: varchar("status", { length: 20 }).notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_test_key_staff").on(table.staffId), index("idx_test_key_hash").on(table.keyHash)],
);

export type StaffTestKey = typeof staffTestKeys.$inferSelect;
export type NewStaffTestKey = typeof staffTestKeys.$inferInsert;
