import { pgTable, serial, integer, varchar, pgEnum, timestamp, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { suppliers } from './suppliers';

export const supplierKeySelectModeEnum = pgEnum('supplier_key_select_mode', [
  'single',
  'polling',
  'random',
]);

export const supplierKeys = pgTable('supplier_keys', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  keyValue: text('key_value').notNull(),
  name: varchar('name', { length: 100 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  selectMode: supplierKeySelectModeEnum('select_mode').notNull().default('single'),
  currentBalance: varchar('current_balance', { length: 50 }),
  balanceCheckedAt: timestamp('balance_checked_at'),
  priority: integer('priority').default(0),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const supplierKeysRelations = relations(supplierKeys, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierKeys.supplierId],
    references: [suppliers.id],
  }),
}));
