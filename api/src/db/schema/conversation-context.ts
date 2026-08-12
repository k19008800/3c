import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
  numeric,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { apiKeys } from './api-keys';
import { suppliers } from './suppliers';
import { supplierModels } from './supplier-models';

/**
 * 对话上下文留痕表 — 每笔 /v1/chat/completions 请求的完整上下文记录
 *
 * 用途：交易纠纷举证 / 政府调证 —— 管理员后台查询、回放、导出。
 * 设计要点：
 *   - requestId 与 consumption_records.request_id 一一对应，可互相跳转
 *   - messages / responseText 全量原样存储，不做脱敏（举证完整性优先）
 *   - 供应商 Key 只存 sha256 指纹（supplierKeyFp），不存明文 Key
 *   - 与计费解耦：失败 / 402 / 超时等无消费记录的请求同样留痕（status 标记）
 *   - 采集是旁路写入：不参与计费、失败不抛错，绝不阻断主链路
 */
export const conversationContextRecords = pgTable(
  'conversation_context_records',
  {
    id: serial('id').primaryKey(),

    // 关联消费记录（一一对应）
    requestId: varchar('request_id', { length: 100 }).notNull().unique(),
    userId: integer('user_id').notNull().references(() => users.id),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id),
    // 客户端 API Key 指纹（对应 api_keys.key_hash，非明文）
    clientKeyHash: varchar('client_key_hash', { length: 255 }).notNull(),

    // 模型与路由
    requestedModel: varchar('requested_model', { length: 200 }).notNull(),
    routedModel: varchar('routed_model', { length: 200 }),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    supplierModelId: integer('supplier_model_id').references(() => supplierModels.id),
    // 供应商 Key 指纹（sha256 前缀，不存明文 Key）
    supplierKeyFp: varchar('supplier_key_fp', { length: 64 }),

    // 上下文内容（全量原样，不脱敏）
    messages: jsonb('messages').notNull(),
    responseText: text('response_text'),
    finishReason: varchar('finish_reason', { length: 50 }),

    // 状态与计费（与 consumption_records 对应，但失败/402 也有记录）
    status: varchar('status', { length: 20 }).notNull(),
    errorCode: varchar('error_code', { length: 50 }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cost: numeric('cost', { precision: 18, scale: 8 }),

    // 请求环境
    clientIp: varchar('client_ip', { length: 50 }),
    userAgent: text('user_agent'),

    // 时间
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ccr_request_id').on(table.requestId),
    index('idx_ccr_user').on(table.userId),
    index('idx_ccr_status').on(table.status),
    index('idx_ccr_supplier').on(table.supplierId),
    index('idx_ccr_occurred').on(table.occurredAt),
    index('idx_ccr_user_occurred').on(table.userId, table.occurredAt),
  ],
);

export const conversationContextRecordsRelations = relations(conversationContextRecords, ({ one }) => ({
  user: one(users, {
    fields: [conversationContextRecords.userId],
    references: [users.id],
  }),
  apiKey: one(apiKeys, {
    fields: [conversationContextRecords.apiKeyId],
    references: [apiKeys.id],
  }),
  supplier: one(suppliers, {
    fields: [conversationContextRecords.supplierId],
    references: [suppliers.id],
  }),
}));

export type ConversationContextRecord = typeof conversationContextRecords.$inferSelect;
export type NewConversationContextRecord = typeof conversationContextRecords.$inferInsert;
