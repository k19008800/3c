import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 知识库文章表
 * 对齐 docs/ref-10.2-knowledge-base.md
 */
export const knowledgeBaseArticles = pgTable(
  "knowledge_base_articles",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    category: varchar("category", { length: 100 }),
    content: text("content"),
    tags: text("tags"), // 逗号分隔
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft / published / archived
    viewCount: integer("view_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),
    unhelpfulCount: integer("unhelpful_count").notNull().default(0),
    authorId: integer("author_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_kb_status").on(table.status),
    categoryIdx: index("idx_kb_category").on(table.category),
    searchIdx: index("idx_kb_search").on(table.title, table.tags),
  }),
);

/**
 * 知识库分类表
 */
export const knowledgeBaseCategories = pgTable("knowledge_base_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 文章反馈表
 */
export const knowledgeBaseFeedback = pgTable("knowledge_base_feedback", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => knowledgeBaseArticles.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  helpful: boolean("helpful").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  articleIdx: index("idx_kb_feedback_article").on(table.articleId),
}));

/**
 * 快捷回复模板表
 * 对齐 docs/ref-10.4-quick-reply.md
 */
export const quickReplyTemplates = pgTable(
  "quick_reply_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }),
    content: text("content").notNull(),
    // 支持变量：{username}, {balance} 等
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("idx_qr_category").on(table.category),
  }),
);

export type KnowledgeBaseArticle = typeof knowledgeBaseArticles.$inferSelect;
export type NewKnowledgeBaseArticle = typeof knowledgeBaseArticles.$inferInsert;
export type KnowledgeBaseCategory = typeof knowledgeBaseCategories.$inferSelect;
export type NewKnowledgeBaseCategory = typeof knowledgeBaseCategories.$inferInsert;
export type KnowledgeBaseFeedback = typeof knowledgeBaseFeedback.$inferSelect;
export type QuickReplyTemplate = typeof quickReplyTemplates.$inferSelect;
export type NewQuickReplyTemplate = typeof quickReplyTemplates.$inferInsert;
