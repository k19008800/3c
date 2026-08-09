import { pgTable, serial, integer, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const riskEvents = pgTable('risk_events', {
  id: serial('id').primaryKey(),
  ruleId: integer('rule_id').notNull(),
  userId: integer('user_id'),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('medium'),
  details: jsonb('details'),
  resolved: varchar('resolved', { length: 1 }).default('0'),
  resolvedBy: integer('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
