import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/** 客服在线状态持久化 对齐 SPEC-§27.1 */
export const staffChatStatus = pgTable(
  "staff_chat_status",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull().references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("offline"), // online / busy / offline
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uk_staff_status").on(table.staffId)],
);

/** 聊天满意度评价 */
export const chatFeedback = pgTable(
  "chat_feedback",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    userId: integer("user_id").notNull(),
    rating: integer("rating").notNull(), // 1-3 (😊满意 😐一般 😞不满意)
    comment: varchar("comment", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_chat_fb_session").on(table.sessionId)],
);
