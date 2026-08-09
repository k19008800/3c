import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric } from 'drizzle-orm/pg-core';

export const agentCommissionStatusEnum = pgEnum('agent_commission_status', [
  'pending',
  'settled',
  'cancelled',
]);

export const agentCommissions = pgTable('agent_commissions', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull(),
  customerUserId: integer('customer_user_id').notNull(),
  consumptionRecordId: integer('consumption_record_id'),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  rate: numeric('rate', { precision: 5, scale: 2 }).notNull(),
  status: agentCommissionStatusEnum('status').notNull().default('pending'),
  settledAt: timestamp('settled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
