import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text } from 'drizzle-orm/pg-core';

export const balanceTransactionTypeEnum = pgEnum('balance_transaction_type', [
  'recharge',
  'consumption',
  'refund',
  'adjustment',
  'commission',
  'withdrawal',
  'freeze',
  'unfreeze',
]);

export const balanceTransactions = pgTable('balance_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  type: balanceTransactionTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 4 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: varchar('reference_id', { length: 100 }),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
