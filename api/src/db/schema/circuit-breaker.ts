import { pgTable, serial, integer, varchar, pgEnum, timestamp } from 'drizzle-orm/pg-core';

export const circuitBreakerStatusEnum = pgEnum('circuit_breaker_status', [
  'active',
  'open',
  'half_open',
]);

export const circuitBreakerState = pgTable('circuit_breaker_state', {
  id: serial('id').primaryKey(),
  channelKey: varchar('channel_key', { length: 200 }).notNull().unique(),
  failureCount: integer('failure_count').notNull().default(0),
  totalCount: integer('total_count').notNull().default(0),
  windowStart: timestamp('window_start').notNull().defaultNow(),
  status: circuitBreakerStatusEnum('status').notNull().default('active'),
  openedAt: timestamp('opened_at'),
  lastProbeAt: timestamp('last_probe_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
