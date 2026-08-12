import { pgTable, serial, integer, varchar, timestamp, boolean, text, numeric } from 'drizzle-orm/pg-core';
import { supplierModels } from './supplier-models';

/**
 * 价格变更日志 — 销售价（vendor_pricing）变更时写入
 * 对齐 PRD §3.1 price_change_logs，model 引用 supplier_models
 */
export const priceChangeLogs = pgTable('price_change_logs', {
  id: serial('id').primaryKey(),
  supplierModelId: integer('supplier_model_id').notNull().references(() => supplierModels.id),
  vendorId: integer('vendor_id').notNull(),
  oldInputPrice: numeric('old_input_price', { precision: 12, scale: 6 }),
  newInputPrice: numeric('new_input_price', { precision: 12, scale: 6 }),
  oldOutputPrice: numeric('old_output_price', { precision: 12, scale: 6 }),
  newOutputPrice: numeric('new_output_price', { precision: 12, scale: 6 }),
  oldSalePrice: numeric('old_sale_price', { precision: 12, scale: 6 }),
  newSalePrice: numeric('new_sale_price', { precision: 12, scale: 6 }),
  changeRate: numeric('change_rate', { precision: 8, scale: 3 }).notNull(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
  reason: varchar('reason', { length: 500 }),
  operatorId: integer('operator_id'),
  dispatched: boolean('dispatched').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
