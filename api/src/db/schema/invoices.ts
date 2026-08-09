import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text } from 'drizzle-orm/pg-core';

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'paid',
  'cancelled',
  'void',
]);

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  invoiceNo: varchar('invoice_no', { length: 50 }).notNull().unique(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  tax: numeric('tax', { precision: 18, scale: 2 }).default('0'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  title: varchar('title', { length: 200 }),
  taxId: varchar('tax_id', { length: 50 }),
  recipient: text('recipient'),
  issuedAt: timestamp('issued_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
