import {
  pgTable, serial, integer, varchar, text, boolean, timestamp, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 用户通知消息表
 * 站内通知系统：余额提醒/安全告警/系统公告等
 */
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content"),
    category: varchar("category", { length: 30 }).notNull().default("system"),
    // finance / security / system / marketing
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_un_user").on(table.userId),
    index("idx_un_user_read").on(table.userId, table.isRead),
    index("idx_un_created").on(table.createdAt),
  ],
);

export const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  finance: "财务",
  security: "安全",
  system: "系统",
  marketing: "营销",
};

export type UserNotification = typeof userNotifications.$inferSelect;
export type NewUserNotification = typeof userNotifications.$inferInsert;
