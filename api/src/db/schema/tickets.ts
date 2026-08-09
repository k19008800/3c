import { pgTable, serial, integer, varchar, pgEnum, timestamp, text, jsonb } from 'drizzle-orm/pg-core';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
]);

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('general'),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: varchar('priority', { length: 20 }).default('normal'),
  assignedTo: integer('assigned_to'),
  resolution: text('resolution'),
  resolvedAt: timestamp('resolved_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
