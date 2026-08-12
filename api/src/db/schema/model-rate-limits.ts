import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * 模型限流硬顶（系统级）
 * 原型 admin-credit.html「模型限流」区：每个模型一个硬顶（cap_rpm/cap_tpm）。
 * 企业/个人默认值存 system_config；模型硬顶为最高约束，
 * 额度页 effective() = min(客户例外 ?? 企业/个人默认, 模型硬顶)。
 */
export const modelRateLimits = pgTable('model_rate_limits', {
  id: serial('id').primaryKey(),
  modelName: varchar('model_name', { length: 100 }).notNull().unique(),
  vendor: varchar('vendor', { length: 50 }),
  // 硬顶 RPM/TPM：超过此值即视为「截断」，按次计费模型（如 o1）用 base_* 覆盖
  capRpm: integer('cap_rpm'),
  capTpm: integer('cap_tpm'),
  baseRpm: integer('base_rpm'),
  baseTpm: integer('base_tpm'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ModelRateLimit = typeof modelRateLimits.$inferSelect;
export type NewModelRateLimit = typeof modelRateLimits.$inferInsert;
