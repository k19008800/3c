import { pgTable, serial, integer, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';

export const agentBankAccounts = pgTable('agent_bank_accounts', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  bankName: varchar('bank_name', { length: 100 }).notNull(),
  accountNumber: varchar('account_number', { length: 50 }).notNull(),
  accountHolder: varchar('account_holder', { length: 100 }).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('agent_bank_accounts_agent_id_idx').on(t.agentId),
]);

export const agentBankAccountsRelations = relations(agentBankAccounts, ({ one }) => ({
  agent: one(agents, {
    fields: [agentBankAccounts.agentId],
    references: [agents.id],
  }),
}));
