import { pgTable, serial, varchar, pgEnum, timestamp, integer, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { supplierKeys } from './supplier-keys';
import { supplierModels } from './supplier-models';

export const supplierStatusEnum = pgEnum('supplier_status', [
  'active',
  'maintenance',
  'offline',
  'deprecated',
]);

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  baseUrl: varchar('base_url', { length: 500 }).notNull(),
  apiType: varchar('api_type', { length: 50 }).notNull().default('openai'),
  status: supplierStatusEnum('status').notNull().default('active'),
  healthStatus: varchar('health_status', { length: 20 }).default('unknown'),
  healthLastCheck: timestamp('health_last_check'),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  keys: many(supplierKeys),
  models: many(supplierModels),
}));
