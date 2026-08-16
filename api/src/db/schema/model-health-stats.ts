import { pgTable, serial, integer, varchar, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { suppliers } from './suppliers';
import { supplierModels } from './supplier-models';

/**
 * 模型健康度桶表 — Admin 模型市场（/models/marketplace）的数据底座
 *
 * 5 分钟对齐的预聚合桶，每桶记录一个平台模型 × 供应商在该窗口内的
 * 请求数 / 成功数 / 失败数 / 错误码分布 / 延迟直方图。
 * 由 model-health-aggregator Worker 从 conversation_context_records 滚动聚合写入，
 * API 只查本表（跨窗口累加桶），不实时扫明细。
 *
 * 口径：
 *   - platform_model = conversation.requested_model（客户请求的标准模型名）
 *   - 成功 = status = 'succeeded'；失败 = status <> 'succeeded' 或 error_code 非空
 *   - 延迟(ms) = completed_at - occurred_at；直方图桶边界见 lib/latency.ts
 */
export const modelHealthStats = pgTable(
  'model_health_stats',
  {
    id: serial('id').primaryKey(),
    bucketStart: timestamp('bucket_start').notNull(),
    platformModel: varchar('platform_model', { length: 200 }).notNull(),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    supplierModelId: integer('supplier_model_id').references(() => supplierModels.id, { onDelete: 'cascade' }),
    requestCount: integer('request_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    errorCodeDist: jsonb('error_code_dist').$type<Record<string, number>>().notNull().default({}),
    latencyHist: jsonb('latency_hist').$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_model_health_bucket').on(t.bucketStart, t.platformModel, t.supplierId),
    index('idx_mhs_model').on(t.platformModel),
    index('idx_mhs_bucket').on(t.bucketStart),
  ],
);

export const modelHealthStatsRelations = relations(modelHealthStats, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [modelHealthStats.supplierId],
    references: [suppliers.id],
  }),
  supplierModel: one(supplierModels, {
    fields: [modelHealthStats.supplierModelId],
    references: [supplierModels.id],
  }),
}));
