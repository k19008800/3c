import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 公告表
 * 对齐 ref-4.5-marketing.md §3 公告系统
 * 管理端发布公告，用户端可见 + 记录已读状态
 * status: true=已发布, false=草稿
 */
export const announcements = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull(),
    // 类型: system_announcement / maintenance / activity / security
    type: varchar("type", { length: 50 }).notNull().default("system_announcement"),
    status: boolean("status").notNull().default(false), // true=已发布
    priority: integer("priority").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ann_status").on(table.status),
    index("idx_ann_created").on(table.createdAt),
  ],
);

/**
 * 公告已读记录表（用户标记已读）
 */
export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_ann_read_user").on(table.announcementId, table.userId),
  ],
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type AnnouncementRead = typeof announcementReads.$inferSelect;
