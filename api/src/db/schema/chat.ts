import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/** 在线客服聊天会话 对齐 SPEC-§27 */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    staffId: integer("staff_id").references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("waiting"),
    // waiting / active / closed / transferred_to_ticket
    category: varchar("category", { length: 30 }),
    queuePosition: integer("queue_position"),
    waitingStartedAt: timestamp("waiting_started_at", { withTimezone: true }),
    staffAssignedAt: timestamp("staff_assigned_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: varchar("closed_by", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_chat_user").on(table.userId), index("idx_chat_staff").on(table.staffId), index("idx_chat_status").on(table.status)],
);

/** 聊天消息 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => chatSessions.id),
    senderId: integer("sender_id").notNull().references(() => users.id),
    senderType: varchar("sender_type", { length: 10 }).notNull(), // user / staff / system
    contentType: varchar("content_type", { length: 20 }).notNull().default("text"),
    content: text("content").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_chat_msg_session").on(table.sessionId)],
);

/** 预设消息 */
export const chatPresets = pgTable(
  "chat_presets",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 20 }).notNull(), // welcome / waiting / closing / offline / custom
    title: varchar("title", { length: 100 }),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_chat_preset_type").on(table.type)],
);
