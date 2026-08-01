import { pgTable, serial, integer, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 用户设备 对齐 SPEC-§20.3 设备管理
 */
export const userDevices = pgTable(
  "user_devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    sessionId: varchar("session_id", { length: 64 }),
    deviceName: varchar("device_name", { length: 200 }),
    deviceType: varchar("device_type", { length: 20 }), // desktop | mobile | tablet
    os: varchar("os", { length: 100 }),
    browser: varchar("browser", { length: 100 }),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 45 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    fingerprint: varchar("fingerprint", { length: 64 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(false),
    riskLevel: varchar("risk_level", { length: 20 }).notNull().default("normal"), // normal | suspicious | unknown
    riskRule: varchar("risk_rule", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    loggedOutAt: timestamp("logged_out_at", { withTimezone: true }),
    loggedOutBy: varchar("logged_out_by", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_user_device_user").on(table.userId, table.isActive), index("idx_user_device_fp").on(table.fingerprint)],
);
