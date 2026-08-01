import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
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
  // 鎻愮幇鍐荤粨浣欓锛堝垎锛?4浣嶅皬鏁帮級
  pendingBalance: integer("pending_balance").notNull().default(0),
  // 实名认证状态
  realNameStatus: varchar("real_name_status", { length: 20 }).default("unverified"),
  // 代理关系（自引用，须用函数形式避免 TS7022 递归类型）
  agentId: integer("agent_id").references((): AnyPgColumn => users.id),
  // ===== §20.2 双因素认证（2FA）=====
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: varchar("two_factor_secret", { length: 200 }), // 加密存储
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  twoFactorEnabledAt: timestamp("two_factor_enabled_at", { withTimezone: true }),
  twoFactorLockedUntil: timestamp("two_factor_locked_until", { withTimezone: true }),
  twoFactorFailedAttempts: integer("two_factor_failed_attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
