import { pgTable, serial, integer, varchar, pgEnum, timestamp, text, jsonb, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { suppliers } from './suppliers.js';

export const modelStatusEnum = pgEnum('model_status', [
  'active',
  'inactive',
  'deprecated',
  'beta',
]);

export const supplierModels = pgTable('supplier_models', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  modelName: varchar('model_name', { length: 200 }).notNull(),
  platformModel: varchar('platform_model', { length: 200 }).notNull(),
  /**
   * 模型编码（model_code）——「模型编码化改造」引入的全局唯一可路由编码。
   * 一个（逻辑模型 × 供应商）= 一条唯一编码，作为用户 API `model` 参数的权威值，
   * 一对一映射本行（supplier + model_name + platform_model）。
   * 命名：平台短 code（如 `dsv4f-vb`，仅 [a-zA-Z0-9_-]，不含 `@`）。
   * 唯一性：部分唯一索引（model_code IS NOT NULL），防复用/改码。
   */
  modelCode: varchar('model_code', { length: 200 }),
  inputPrice: varchar('input_price', { length: 30 }).notNull().default('0'),
  outputPrice: varchar('output_price', { length: 30 }).notNull().default('0'),
  /**
   * 缓存读取成本价（¥/1K tokens，可空）。
   * 由供应商同步引擎（P3）从上游价格页抓取/映射填充；无法获取时置空。
   * P0 仅建列，不写同步/结算逻辑（ARCH 评审 D-12：新列 numeric(18,6)，既有 varchar 列不迁移）。
   */
  costCacheReadInputPrice: numeric('cost_cache_read_input_price', { precision: 18, scale: 6 }),
  /**
   * 缓存写入成本价（¥/1K tokens，可空；仅 Anthropic 系使用）。
   * 同 costCacheReadInputPrice：P0 仅建列，P3 结算/同步使用。
   */
  costCacheWriteInputPrice: numeric('cost_cache_write_input_price', { precision: 18, scale: 6 }),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  priceUnit: varchar('price_unit', { length: 20 }).default('per_1M_tokens'),
  status: modelStatusEnum('status').notNull().default('active'),
  capabilities: jsonb('capabilities').$type<string[]>().default([]),
  maxTokens: integer('max_tokens'),
  description: text('description'),
  syncedAt: timestamp('synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  /** 模型编码部分唯一索引：仅供有编码的行约束唯一，容忍存量行无编码 */
  modelCodeUniqueIdx: uniqueIndex('uq_supplier_models_model_code').on(table.modelCode),
}));

export const supplierModelsRelations = relations(supplierModels, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierModels.supplierId],
    references: [suppliers.id],
  }),
}));
