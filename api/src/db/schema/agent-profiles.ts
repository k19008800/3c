import {
  pgTable,
  serial,
  integer,
  varchar,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 代理信息表
 * 对齐 PRD-代理商体系 + ref-3-agent-system.md
 * 关联 users：一人一代理档案（userId 唯一）
 * 等级：prepare(预备)/level1(一级)/senior(高级)
 */
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => users.id),

    // 代理等级
    level: varchar("level", { length: 20 }).notNull().default("prepare"),

    // 佣金率（存小数，如 0.10 = 10%）
    commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }).notNull().default("0"),

    // 实名/资质审核状态
    verifyStatus: varchar("verify_status", { length: 20 }).notNull().default("unverified"),

    // 提现设置
    withdrawAccount: varchar("withdraw_account", { length: 64 }),
    withdrawBank: varchar("withdraw_bank", { length: 100 }),
    withdrawName: varchar("withdraw_name", { length: 50 }),

    // 通知偏好（JSON 字符串：{"customer_alert":true,"commission_notify":true,...}）
    notifPrefs: varchar("notif_prefs", { length: 255 }).default("{}"),

    // 邀请码
    referralCode: varchar("referral_code", { length: 32 }).unique(),

    // 上级代理（自引用 users）
    parentUserId: integer("parent_user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_agent_profile_level").on(table.level)],
);

export type AgentProfile = typeof agentProfiles.$inferSelect;
export type NewAgentProfile = typeof agentProfiles.$inferInsert;
