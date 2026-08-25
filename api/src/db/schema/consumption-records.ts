import {
  pgTable, serial, integer, varchar, timestamp, boolean, text, jsonb, numeric,
  index, primaryKey, unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { apiKeys } from './api-keys';

/**
 * 消费记录表（P3-1 起为按月 RANGE 分区表，migration 0025）
 *
 * ⚠️ 分区表硬性要求：唯一约束/主键必须包含分区列 created_at →
 *   - 主键为复合 (id, created_at)（drizzle primaryKey({ columns })）
 *   - request_id 唯一约束为复合 (request_id, created_at)
 *     （幂等 L2 DB 兜底依赖；约束名 consumption_records_request_id_created_at_unique，
 *      分区子表索引名形如 consumption_records_2026_08_request_id_created_at_key，
 *      idempotency.ts 正则已兼容两种命名）
 *
 * 实际 DDL 由 api/src/db/migrations/0025_partition_big_tables.sql 手工维护
 * （drizzle-kit 生成不了分区 DDL，禁止 db:push 覆盖），本文件仅为类型层同步。
 */
export const consumptionRecords = pgTable('consumption_records', {
  id: serial('id'),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  apiKeyId: integer('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  requestId: varchar('request_id', { length: 100 }).notNull(),
  model: varchar('model', { length: 200 }).notNull(),
  supplierId: integer('supplier_id'),
  supplierModelId: integer('supplier_model_id'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  cost: numeric('cost', { precision: 18, scale: 8 }).notNull().default('0'),
  /** 缓存命中 token 数（上游 usage 返回缓存字段时才有值；无缓存信息场景为 NULL，计费行为不变） */
  cacheHitTokens: integer('cache_hit_tokens'),
  /** 缓存命中打折省下的金额（全价 - 折后价，元）；无缓存信息场景为 NULL */
  cacheDiscount: numeric('cache_discount', { precision: 18, scale: 8 }),
  /**
   * 缓存写入 token 数（Anthropic cache_creation_input_tokens；0031 迁移新增，D-8）。
   * 写入缓存（首次写入）的输入 token，按缓存写入价（显式价或生效 input 全价）计费。
   */
  cacheWriteTokens: integer('cache_write_tokens'),
  /** 缓存读取计费金额（元，numeric(18,8)，D-8/D-1）；无缓存读取场景为 NULL */
  cacheHitCost: numeric('cache_hit_cost', { precision: 18, scale: 8 }),
  /** 缓存写入计费金额（元，numeric(18,8)）；无缓存写入场景为 NULL */
  cacheWriteCost: numeric('cache_write_cost', { precision: 18, scale: 8 }),
  /**
   * 本次调用实际采用的缓存读取单价快照（¥/1K，numeric(18,6)，D-8 定价快照并入本表）。
   * 审计/对账口径：逐笔记录实际计费用单价（显式价或回退链结果）。
   */
  cacheReadInputPrice: numeric('cache_read_input_price', { precision: 18, scale: 6 }),
  /** 本次调用实际采用的缓存写入单价快照（¥/1K；显式价缺失时为生效 input 全价） */
  cacheWriteInputPrice: numeric('cache_write_input_price', { precision: 18, scale: 6 }),
  currency: varchar('currency', { length: 10 }).default('CNY'),
  trustUpstream: boolean('trust_upstream').notNull().default(false),
  fallback: boolean('fallback').notNull().default(false),
  streamed: boolean('streamed').notNull().default(false),
  finishReason: varchar('finish_reason', { length: 50 }),
  errorCode: varchar('error_code', { length: 50 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // 分区表复合主键（id, created_at）
  pk: primaryKey({ columns: [table.id, table.createdAt] }),
  // 幂等 L2 DB 兜底：request_id 唯一约束（分区表必须含分区列 created_at）
  requestIdUnique: unique('consumption_records_request_id_created_at_unique').on(table.requestId, table.createdAt),
  // 高频查询索引（migration 0025 创建）：用户维度 + 时间范围（/me/stats、/me/logs、admin 列表）
  userIdCreatedAtIdx: index('idx_consumption_records_user_created').on(table.userId, table.createdAt),
}));

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
