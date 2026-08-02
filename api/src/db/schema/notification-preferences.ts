import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 用户通知偏好
 * 对应 SPEC-§22-用户端体验增强.md §22.6
 * JSONB 列存储避免每类事件一个列
 */
export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").default(true),
    emailFrequency: varchar("email_frequency", { length: 20 }).default("daily"),
    emailDigestTime: varchar("email_digest_time", { length: 5 }).default("09:00"),
    inAppPreferences: jsonb("in_app_preferences").default({}),
    emailPreferences: jsonb("email_preferences").default({}),
    balanceLowThreshold: integer("balance_low_threshold").default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_user_notif_prefs_new").on(table.userId)],
);

export type UserNotificationPreference = typeof userNotificationPreferences.$inferSelect;
export type NewUserNotificationPreference = typeof userNotificationPreferences.$inferInsert;

/**
 * 默认通知偏好
 */
export const DEFAULT_IN_APP_PREFERENCES: Record<string, boolean> = {
  recharge_success: true,
  consumption_notify: true,
  balance_low: true,
  refund_status: true,
  login_reminder: true,
  key_created_deleted: true,
  login_anomaly: true,
  "2fa_changed": true,
  system_maintenance: true,
  api_changed: true,
  version_update: true,
  campaign_notify: true,
  promotion_info: true,
  product_update: true,
};

export const DEFAULT_EMAIL_PREFERENCES: Record<string, boolean> = {
  recharge_success: true,
  consumption_notify: true,
  balance_low: true,
  refund_status: true,
  login_reminder: true,
  key_created_deleted: true,
  login_anomaly: true,
  "2fa_changed": true,
  system_maintenance: false,
  api_changed: false,
  version_update: false,
  campaign_notify: false,
  promotion_info: false,
  product_update: false,
};

/**
 * 通知事件分类
 */
export const NOTIFICATION_CATEGORIES = {
  finance: ["recharge_success", "consumption_notify", "balance_low", "refund_status"],
  security: ["login_reminder", "key_created_deleted", "login_anomaly", "2fa_changed"],
  system: ["system_maintenance", "api_changed", "version_update"],
  marketing: ["campaign_notify", "promotion_info", "product_update"],
} as const;

export const NOTIFICATION_EVENT_LABELS: Record<string, string> = {
  recharge_success: "充值成功",
  consumption_notify: "消费通知",
  balance_low: "余额不足",
  refund_status: "退款状态",
  login_reminder: "登录提醒",
  key_created_deleted: "Key 创建/删除",
  login_anomaly: "异常登录",
  "2fa_changed": "2FA 变更",
  system_maintenance: "系统维护",
  api_changed: "API 变更",
  version_update: "版本更新",
  campaign_notify: "活动通知",
  promotion_info: "优惠信息",
  product_update: "产品更新",
};

/**
 * 强制开启的事件（不可关闭）
 */
export const FORCED_EVENTS = new Set(["login_anomaly", "2fa_changed"]);
