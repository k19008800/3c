import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * 邮件发送日志表
 * 记录每次 SMTP 实际发送结果（成功/失败 + 模板 + 变量 + 错误信息）
 */
export const emailLogs = pgTable(
  "email_logs",
  {
    id: serial("id").primaryKey(),
    toAddress: varchar("to_address", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 500 }).notNull(),
    templateName: varchar("template_name", { length: 100 }),
    vars: text("vars"), // JSON
    status: varchar("status", { length: 20 }).notNull().default("sent"), // sent/failed
    error: text("error"),
    messageId: varchar("message_id", { length: 200 }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_email_logs_created").on(table.createdAt),
    index("idx_email_logs_status").on(table.status),
  ],
);

export type EmailLog = typeof emailLogs.$inferSelect;
