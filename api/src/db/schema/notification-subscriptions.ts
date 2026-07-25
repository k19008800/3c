// ============================================================
//  3cloud (3C) — 通知订阅与偏好设置
// ============================================================

import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// 告警类型枚举
export const alertTypeEnum = pgEnum("alert_type", [
  "failure_rate_spike",
  "quota_exhaustion", 
  "suspicious_login",
  "abnormal_call_pattern",
  "security_event",
  "system_maintenance",
  "feature_update",
  "billing_reminder"
]);

// 告警级别枚举
export const alertLevelEnum = pgEnum("alert_level", [
  "info",
  "warning",
  "error",
  "critical"
]);

// 通知类型枚举（扩展）
export const notificationTypeEnumExtended = pgEnum("notification_type_extended", [
  // 原有类型
  "announcement",
  "transaction",
  "system",
  "promotion",
  "agent",
  "alert",
  
  // 新增告警类型
  "failure_rate_spike",
  "quota_exhaustion", 
  "suspicious_login",
  "abnormal_call_pattern",
  "security_event",
  "system_maintenance",
  "feature_update",
  "billing_reminder"
]);

// 用户通知订阅表
export const userNotificationSubscriptions = pgTable(
  "user_notification_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: alertTypeEnum("type").notNull(),
    subscribed: boolean("subscribed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdTypeIdx: uniqueIndex("user_notification_subscriptions_user_id_type_idx")
      .on(table.userId, table.type),
    userIdIdx: index("user_notification_subscriptions_user_id_idx").on(table.userId),
  })
);

// 用户通知偏好设置表
export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    
    // 通知渠道设置
    browserNotifications: boolean("browser_notifications").notNull().default(true),
    mobilePush: boolean("mobile_push").notNull().default(true),
    emailNotifications: boolean("email_notifications").notNull().default(false),
    
    // 静默时段设置
    quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }).notNull().default("22:00"), // HH:mm 格式
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }).notNull().default("08:00"),
    
    // 告警过滤设置
    enabledAlertLevels: text("enabled_alert_levels").notNull().default('["critical", "error", "warning", "info"]'),
    minimumAlertLevel: alertLevelEnum("minimum_alert_level").notNull().default("info"),
    
    // 特殊设置
    criticalAlertsAlways: boolean("critical_alerts_always").notNull().default(true),
    soundEnabled: boolean("sound_enabled").notNull().default(true),
    vibrationEnabled: boolean("vibration_enabled").notNull().default(true),
    
    // 元数据
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 实时告警推送记录表（用于历史记录）
export const alertPushHistory = pgTable(
  "alert_push_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alertId: varchar("alert_id", { length:156 }).notNull(),
    alertType: alertTypeEnum("alert_type").notNull(),
    alertLevel: alertLevelEnum("alert_level").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    metadata: text("metadata"), // JSON 字符串
    
    // 推送状态
    pushedToBrowser: boolean("pushed_to_browser").notNull().default(false),
    pushedToMobile: boolean("pushed_to_mobile").notNull().default(false),
    pushedToEmail: boolean("pushed_to_email").notNull().default(false),
    
    // 用户交互状态
    viewed: boolean("viewed").notNull().default(false),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    clicked: boolean("clicked").notNull().default(false),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    
    // 时间戳
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("alert_push_history_user_id_created_at_idx")
      .on(table.userId, table.createdAt),
    alertIdIdx: index("alert_push_history_alert_id_idx").on(table.alertId),
    unviewedIdx: index("alert_push_history_unviewed_idx").on(table.userId, table.viewed),
  })
);