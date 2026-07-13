// ============================================================
//  3cloud (3C) — 用户通知（站内信）
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { notificationTypeEnum } from "./enums.js";
import { users } from "./users.js";

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    refType: varchar("ref_type", { length: 50 }),
    refId: integer("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("user_notifications_user_id_created_at_idx").on(table.userId, table.createdAt),
    unreadIdx: index("user_notifications_unread_idx").on(table.userId, table.readAt),
  })
);
