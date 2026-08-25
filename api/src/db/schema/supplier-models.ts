import { pgTable, serial, integer, varchar, pgEnum, timestamp, text, jsonb, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { suppliers } from './suppliers';

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
});

export const supplierModelsRelations = relations(supplierModels, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierModels.supplierId],
    references: [suppliers.id],
  }),
}));
