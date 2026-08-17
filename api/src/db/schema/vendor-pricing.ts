import { pgTable, serial, integer, varchar, pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { supplierModels } from './supplier-models';

export const pricingStatusEnum = pgEnum('pricing_status', [
  'draft',
  'active',
  'archived',
]);

export const vendorPricing = pgTable('vendor_pricing', {
  id: serial('id').primaryKey(),
  supplierModelId: integer('supplier_model_id').notNull().references(() => supplierModels.id, { onDelete: 'cascade' }),
  pricingGroup: varchar('pricing_group', { length: 50 }).notNull().default('default'),
  inputPrice: varchar('input_price', { length: 30 }).notNull(),
  outputPrice: varchar('output_price', { length: 30 }).notNull(),
  /**
   * 缓存命中折扣率（0-1，如 0.1 = 命中部分按全价 10% 计费）。
   * 可空：未配置时回退全局 system_config `billing.cache_hit_discount`（默认 0.1）。
   * 与 inputPrice/outputPrice 同用 varchar 存储，保持历史风格。
   */
  cacheDiscountRate: varchar('cache_discount_rate', { length: 10 }),
  outputMultiplier: varchar('output_multiplier', { length: 10 }).default('1.0'),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  status: pricingStatusEnum('status').notNull().default('draft'),
  effectiveFrom: timestamp('effective_from'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vendorPricingRelations = relations(vendorPricing, ({ one }) => ({
  model: one(supplierModels, {
    fields: [vendorPricing.supplierModelId],
    references: [supplierModels.id],
  }),
}));
