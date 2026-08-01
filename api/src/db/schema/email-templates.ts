import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * 邮件模板表
 * 对齐 ref-4.5-marketing.md §4
 * 模板支持变量占位符 {{username}} {{amount}} 等
 */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull().unique(),   // 模板唯一标识, 如 recharge_success
    // 中文
    subjectZh: varchar("subject_zh", { length: 255 }).notNull(),
    bodyHtmlZh: text("body_html_zh").notNull(),
    // 英文
    subjectEn: varchar("subject_en", { length: 255 }),
    bodyHtmlEn: text("body_html_en"),
    // 使用场景说明
    description: varchar("description", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_email_templates_name").on(table.name)],
);

export const TEMPLATE_VARS: Record<string, string> = {
  username: "用户昵称",
  amount: "金额",
  time: "时间",
  balance: "当前余额",
  keyName: "API Key 名称",
  modelName: "模型名称",
  reason: "原因",
  code: "验证码/兑换码",
};

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
