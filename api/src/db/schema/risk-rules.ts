import { pgTable, serial, varchar, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

export const riskRules = pgTable('risk_rules', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  ruleType: varchar('rule_type', { length: 50 }).notNull(),
  description: varchar('description', { length: 500 }),
  config: jsonb('config').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
