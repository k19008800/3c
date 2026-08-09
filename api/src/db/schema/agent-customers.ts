import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';
import { users } from './users';

export const agentCustomers = pgTable('agent_customers', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  customerUserId: integer('customer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  source: varchar('source', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentCustomersRelations = relations(agentCustomers, ({ one }) => ({
  agent: one(agents, {
    fields: [agentCustomers.agentId],
    references: [agents.id],
  }),
  customer: one(users, {
    fields: [agentCustomers.customerUserId],
    references: [users.id],
  }),
}));
