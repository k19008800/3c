import { pgTable, serial, integer, varchar, pgEnum, timestamp, text, jsonb } from 'drizzle-orm/pg-core';
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
