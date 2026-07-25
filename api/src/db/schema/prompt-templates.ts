// ============================================================
//  3cloud (3C) — 提示词模板库
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// ── 模板分类枚举 ──
// conversation, code, document, analysis, custom

// ── 提示词模板 ──

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: serial("id").primaryKey(),
    
    // 基本信息
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }).notNull().default("custom"),
    // category: conversation | code | document | analysis | custom
    
    // 模板内容
    content: text("content").notNull(),
    
    // 变量定义 (JSON 数组)
    // 示例: [{ "name": "topic", "label": "主题", "default": "", "required": true }]
    variables: jsonb("variables").$type<Array<{
      name: string;
      label: string;
      default?: string;
      required?: boolean;
      description?: string;
    }>>().default([]),
    
    // 审核规则配置 (JSON)
    // 示例: { "checkSensitive": true, "customRules": [], "maxLength": 4000 }
    rules: jsonb("rules").$type<{
      checkSensitive?: boolean;
      customRules?: string[];
      maxLength?: number;
      forbiddenPatterns?: string[];
      requireApproval?: boolean;
    }>().default({}),
    
    // 使用统计
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    
    // 状态
    enabled: boolean("enabled").notNull().default(true),
    isPreset: boolean("is_preset").notNull().default(false), // 预设模板不可删除
    
    // 审核信息
    reviewStatus: varchar("review_status", { length: 20 }).default("approved"),
    // reviewStatus: pending | approved | rejected
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    
    // 元数据
    tags: varchar("tags", { length: 50 }).array().default([]),
    sortOrder: integer("sort_order").default(0),
    
    // 创建信息
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("prompt_templates_category_idx").on(table.category),
    enabledIdx: index("prompt_templates_enabled_idx").on(table.enabled),
    isPresetIdx: index("prompt_templates_preset_idx").on(table.isPreset),
    reviewStatusIdx: index("prompt_templates_review_idx").on(table.reviewStatus),
    createdByIdx: index("prompt_templates_creator_idx").on(table.createdBy),
    createdAtIdx: index("prompt_templates_created_idx").on(table.createdAt),
    usageCountIdx: index("prompt_templates_usage_idx").on(table.usageCount),
  })
);

// ── 类型定义 ──

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;

export interface TemplateVariable {
  name: string;
  label: string;
  default?: string;
  required?: boolean;
  description?: string;
}

export interface TemplateRules {
  checkSensitive?: boolean;
  customRules?: string[];
  maxLength?: number;
  forbiddenPatterns?: string[];
  requireApproval?: boolean;
}
