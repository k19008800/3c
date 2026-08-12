import { pgTable, integer, varchar, numeric, timestamp } from 'drizzle-orm/pg-core';

/**
 * 模型可替代性系数 — 对齐 PRD §3.2 model_substitutability
 * model_id 引用 supplier_models.id；manual_coefficient 非空时覆盖自动值
 */
export const modelSubstitutability = pgTable('model_substitutability', {
  modelId: integer('model_id').primaryKey(),
  autoCoefficient: numeric('auto_coefficient', { precision: 3, scale: 1 }).notNull().default('1.0'),
  manualCoefficient: numeric('manual_coefficient', { precision: 3, scale: 1 }),
  manualReason: varchar('manual_reason', { length: 500 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
