import { pgTable, serial, integer, varchar, pgEnum, timestamp, numeric, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const agentLevelEnum = pgEnum('agent_level', [
  'junior',
  'senior',
  'partner',
]);

export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  level: agentLevelEnum('level').notNull().default('junior'),
  commissionRate: numeric('commission_rate', { precision: 5, scale: 2 }).notNull().default('10.00'),
  totalEarnings: numeric('total_earnings', { precision: 18, scale: 4 }).default('0'),
  availableBalance: numeric('available_balance', { precision: 18, scale: 4 }).default('0'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  inviteCode: varchar('invite_code', { length: 20 }).unique(),
  contactInfo: text('contact_info'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const agentsRelations = relations(agents, ({ one }) => ({
  user: one(users, {
    fields: [agents.userId],
    references: [users.id],
  }),
}));
