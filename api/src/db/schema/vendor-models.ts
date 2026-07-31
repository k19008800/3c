import { pgTable, serial, integer, numeric, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { vendors } from "./vendors";
import { models } from "./models";

/**
 * 供应商-模型映射表
 * 对齐 supplement/07 §2.3 + ref-5.1-routing.md
 * 含每个供应商对该模型的：成本价、售价、路由权重、健康状态
 */
export const vendorModels = pgTable(
  "vendor_models",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().references(() => vendors.id),
    modelId: integer("model_id").notNull().references(() => models.id),
    // 供应商侧模型名（路由时映射）
    upstreamModel: varchar("upstream_model", { length: 200 }).notNull(),
    // 成本价（元/1K tokens，供平台对账）
    costInputPrice: numeric("cost_input_price", { precision: 12, scale: 8 }).notNull().default("0"),
    costOutputPrice: numeric("cost_output_price", { precision: 12, scale: 8 }).notNull().default("0"),
    // 路由器权重与优先级
    weight: integer("weight").notNull().default(1),
    priority: integer("priority").notNull().default(0), // 越大越优先
    isEnabled: boolean("is_enabled").notNull().default(true),
    // 健康度（0-100，路由决策参考）
    healthScore: integer("health_score").default(100),
    // 最近 5 次平均延迟（ms）
    avgLatencyMs: integer("avg_latency_ms").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_vendor_models_model").on(table.modelId),
    index("idx_vendor_models_vendor").on(table.vendorId),
  ],
);

export type VendorModel = typeof vendorModels.$inferSelect;
export type NewVendorModel = typeof vendorModels.$inferInsert;
