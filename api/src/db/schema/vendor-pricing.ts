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
