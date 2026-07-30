// ============================================================
//  3cloud (3C) — 知识库系统（§10.2）
//  Schema: knowledge_base 文章 + knowledge_categories 分类
// ============================================================

import { pgTable, serial, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── 分类 ──
export const knowledgeCategories = pgTable("knowledge_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── 文章 ──
export const knowledgeBase = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),        // 富文本 HTML
  summary: varchar("summary", { length: 500 }),
  categoryId: integer("category_id").references(() => knowledgeCategories.id, { onDelete: "set null" }),
  tags: text("tags"),                          // 逗号分隔
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft | published | archived
  authorId: integer("author_id").notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  helpfulCount: integer("helpful_count").default(0).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
});

// ── Relations ──
export const knowledgeCategoriesRelations = relations(knowledgeCategories, ({ many }) => ({
  articles: many(knowledgeBase),
}));

export const knowledgeBaseRelations = relations(knowledgeBase, ({ one }) => ({
  category: one(knowledgeCategories, {
    fields: [knowledgeBase.categoryId],
    references: [knowledgeCategories.id],
  }),
}));