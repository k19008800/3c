import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 通知订阅偏好表
 * 对齐 ref-4.5-marketing.md §6
 * 用户配置各告警类型推送到站内/邮件
 * 结构: 每行 = (userId, type, channel: email|site) 是否启用
 */
export const notificationSubscriptions = pgTable(
  "notification_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    // 告警类型
    type: varchar("type", { length: 50 }).notNull(),
    // 渠道
    channel: varchar("channel", { length: 20 }).notNull().default("site"), // site/email
    enabled: boolean("notify_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_notif_sub_user_type_channel").on(table.userId, table.type, table.channel),
    index("idx_notif_sub_user").on(table.userId),
  ],
);

export const ALERT_TYPES: Record<string, string> = {
  failure_rate_spike: "失败率飙升",
  quota_exhaustion: "额度耗尽",
  suspicious_login: "可疑登录",
  abnormal_call_pattern: "异常调用模式",
  security_event: "安全事件",
  system_maintenance: "系统维护",
  feature_update: "功能更新",
  billing_reminder: "账单提醒",
};

export type NotificationSubscription = typeof notificationSubscriptions.$inferSelect;
export type NewNotificationSubscription = typeof notificationSubscriptions.$inferInsert;
