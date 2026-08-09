import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text } from 'drizzle-orm/pg-core';

export const agentWithdrawalStatusEnum = pgEnum('agent_withdrawal_status', [
  'pending',
  'processing',
  'completed',
  'rejected',
]);

export const agentWithdrawals = pgTable('agent_withdrawals', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  method: varchar('method', { length: 50 }).notNull(),
  accountInfo: text('account_info'),
  status: agentWithdrawalStatusEnum('status').notNull().default('pending'),
  processedBy: integer('processed_by'),
  processedAt: timestamp('processed_at'),
  remark: text('remark'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
