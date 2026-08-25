import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric } from 'drizzle-orm/pg-core';
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
   * 双轨制下语义降级为"兼容/快捷配置 + 展示反推"（ARCH 评审 D-10/D-13）：显式缓存价（cacheReadInputPrice）优先。
   */
  cacheDiscountRate: varchar('cache_discount_rate', { length: 10 }),
  /**
   * 缓存读取售价（¥/1K tokens，可空；权威计费依据）。
   * 显式配置后按显式价计费（价格解析级 2，D-10）；未配置 → 回退折扣率/全局/兜底。
   * ARCH 评审 D-12：新列 numeric(18,6)，读取统一 Number()，写入 String()。
   */
  cacheReadInputPrice: numeric('cache_read_input_price', { precision: 18, scale: 6 }),
  /**
   * 缓存写入售价（¥/1K tokens，可空；仅 Anthropic 系使用）。
   * 显式配置后按显式价计费；未配置 → 按生效 input 全价（D-3 保守口径）。
   */
  cacheWriteInputPrice: numeric('cache_write_input_price', { precision: 18, scale: 6 }),
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
