import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * 用户表
 * 对齐 supplement/07-Schema重设计建议.md §2.1
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  username: varchar("username", { length: 50 }),
  phone: varchar("phone", { length: 20 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  // 余额（单位：分，避免浮点误差）
  balance: integer("balance").notNull().default(0),
  // 实名认证状态
  realNameStatus: varchar("real_name_status", { length: 20 }).default("unverified"),
  // 代理关系（自引用，须用函数形式避免 TS7022 递归类型）
  agentId: integer("agent_id").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
