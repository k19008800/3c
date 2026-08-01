import { pgTable, serial, integer, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 2FA 恢复码 对齐 SPEC-§20.2（bcrypt 哈希存储）
 */
export const userRecoveryCodes = pgTable(
  "user_recovery_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    code: varchar("code", { length: 120 }).notNull(),
    used: boolean("used").notNull().default(false),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_recovery_code_user").on(table.userId)],
);

/**
 * 2FA 信任设备 对齐 SPEC-§20.2（默认 30 天）
 */
export const sessionTrustedDevices = pgTable(
  "session_trusted_devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    deviceFingerprint: varchar("device_fingerprint", { length: 64 }).notNull(),
    trustedUntil: timestamp("trusted_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_trusted_device_user").on(table.userId), index("idx_trusted_device_fp").on(table.deviceFingerprint)],
);
