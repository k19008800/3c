import { pgTable, serial, varchar, integer, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * 模型定义表（纯净的模型元数据）
 * 对齐 supplement/07 §2.3：models 仅定义模型本身，
 * 供应商-模型映射、成本价、售价、权重在 vendor_models 表
 */
export const models = pgTable(
  "models",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(), // 如 deepseek-chat（平台统一模型名）
    displayName: varchar("display_name", { length: 100 }),
    category: varchar("category", { length: 50 }), // 如 chat / embedding / image
    contextLength: integer("context_length").default(0),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_models_status").on(table.status)],
);

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
