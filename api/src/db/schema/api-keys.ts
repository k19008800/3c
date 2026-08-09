import { pgTable, serial, integer, varchar, pgEnum, timestamp, text, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const apiKeyStatusEnum = pgEnum('api_key_status', [
  'active',
  'disabled',
  'revoked',
]);

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  status: apiKeyStatusEnum('status').notNull().default('active'),
  scopes: jsonb('scopes').$type<string[]>().default([]),
  rateLimitPerMinute: integer('rate_limit_per_minute').default(60),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
