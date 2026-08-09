import { pgTable, serial, integer, varchar, timestamp, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const customerBalances = pgTable('customer_balances', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  totalBalance: numeric('total_balance', { precision: 18, scale: 4 }).notNull().default('0'),
  availableBalance: numeric('available_balance', { precision: 18, scale: 4 }).notNull().default('0'),
  frozenBalance: numeric('frozen_balance', { precision: 18, scale: 4 }).notNull().default('0'),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customerBalancesRelations = relations(customerBalances, ({ one }) => ({
  user: one(users, {
    fields: [customerBalances.userId],
    references: [users.id],
  }),
}));
