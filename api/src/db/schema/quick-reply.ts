import { pgTable, serial, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// 快捷回复分类
export const qrtCategories = pgTable("qrt_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  icon: varchar("icon", { length: 20 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 快捷回复模板
export const quickReplyTemplates = pgTable("quick_reply_templates", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => qrtCategories.id, { onDelete: "set null" }),
  scope: varchar("scope", { length: 20 }).notNull().default("personal"), // personal / team / global
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "cascade" }),
  teamId: integer("team_id"),
  isPinned: boolean("is_pinned").default(false),
  useCount: integer("use_count").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type QRTemplate = typeof quickReplyTemplates.$inferSelect;
export type NewQRTemplate = typeof quickReplyTemplates.$inferInsert;
export type QRCategory = typeof qrtCategories.$inferSelect;
export type NewQRCategory = typeof qrtCategories.$inferInsert;