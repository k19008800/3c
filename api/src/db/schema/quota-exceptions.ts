import { pgTable, serial, integer, varchar, date, timestamp, text, index } from 'drizzle-orm/pg-core';

/**
 * 客户额度例外规则
 * 原型 admin-credit.html：管理员为某个客户×模型开通/编辑/停用限流例外，
 * 生效值 = min(例外 ?? 企业/个人默认, 模型硬顶)。
 */
export const quotaExceptionRules = pgTable(
  'quota_exception_rules',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull(),
    modelName: varchar('model_name', { length: 100 }).notNull(),
    // 可空：留空表示该维度沿用客户默认值（前端校验至少填一项）
    rpm: integer('rpm'),
    tpm: integer('tpm'),
    // forever(永久) / range(指定区间)
    period: varchar('period', { length: 20 }).notNull().default('forever'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    // active(生效) / stopped(已停用)
    status: varchar('status', { length: 20 }).notNull().default('active'),
    reason: text('reason'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_qer_customer').on(table.customerId),
    index('idx_qer_customer_model').on(table.customerId, table.modelName),
  ],
);

/**
 * 额度例外变更历史
 * op: 开通 / 编辑 / 停用 / 启用
 */
export const quotaExceptionHistory = pgTable(
  'quota_exception_history',
  {
    id: serial('id').primaryKey(),
    ruleId: integer('rule_id').notNull().references(() => quotaExceptionRules.id, { onDelete: 'cascade' }),
    op: varchar('op', { length: 20 }).notNull(),
    operatorId: integer('operator_id'),
    // 快照：变更前后的 rpm/tpm（展示「50→80」）
    beforeRpm: integer('before_rpm'),
    beforeTpm: integer('before_tpm'),
    afterRpm: integer('after_rpm'),
    afterTpm: integer('after_tpm'),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_qeh_rule').on(table.ruleId)],
);

export type QuotaExceptionRule = typeof quotaExceptionRules.$inferSelect;
export type NewQuotaExceptionRule = typeof quotaExceptionRules.$inferInsert;
export type QuotaExceptionHistory = typeof quotaExceptionHistory.$inferSelect;
export type NewQuotaExceptionHistory = typeof quotaExceptionHistory.$inferInsert;
