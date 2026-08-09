import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

export const rateLimitEntries = pgTable('rate_limit_entries', {
  id: serial('id').primaryKey(),
  keyId: varchar('key_id', { length: 200 }).notNull(),
  windowMinute: integer('window_minute').notNull(),
  count: integer('count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
