import { pgTable, serial, varchar, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { vendors } from "./vendors";

/**
 * 模型定义表
 * 对齐 supplement/07 §2.3 + ref-4.3-vendor-model.md（模型-供应商映射含成本价）
 */
export const models = pgTable(
  "models",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(), // 如 deepseek-chat
    displayName: varchar("display_name", { length: 100 }),
    vendorId: integer("vendor_id").notNull().references(() => vendors.id),
    // 定价（单位：元/1K tokens，用 decimal 避免误差）
    inputPrice: numeric("input_price", { precision: 12, scale: 8 }).notNull().default("0"),
    outputPrice: numeric("output_price", { precision: 12, scale: 8 }).notNull().default("0"),
    // 成本价（供应商侧）
    costInputPrice: numeric("cost_input_price", { precision: 12, scale: 8 }).default("0"),
    costOutputPrice: numeric("cost_output_price", { precision: 12, scale: 8 }).default("0"),
    contextLength: integer("context_length").default(0),
    category: varchar("category", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_models_vendor").on(table.vendorId)],
);

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
