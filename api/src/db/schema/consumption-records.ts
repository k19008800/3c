import { pgTable, serial, integer, varchar, timestamp, boolean, text, jsonb, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { apiKeys } from './api-keys';

export const consumptionRecords = pgTable('consumption_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  apiKeyId: integer('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  requestId: varchar('request_id', { length: 100 }).notNull().unique(),
  model: varchar('model', { length: 200 }).notNull(),
  supplierId: integer('supplier_id'),
  supplierModelId: integer('supplier_model_id'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  cost: numeric('cost', { precision: 18, scale: 8 }).notNull().default('0'),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  trustUpstream: boolean('trust_upstream').notNull().default(false),
  fallback: boolean('fallback').notNull().default(false),
  streamed: boolean('streamed').notNull().default(false),
  finishReason: varchar('finish_reason', { length: 50 }),
  errorCode: varchar('error_code', { length: 50 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const consumptionRecordsRelations = relations(consumptionRecords, ({ one }) => ({
  user: one(users, {
    fields: [consumptionRecords.userId],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [consumptionRecords.apiKeyId],
    references: [apiKeys.id],
  }),
}));
