import { pgTable, serial, integer, varchar, timestamp, numeric, jsonb, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * 消费异常事件表 — 后台「消费运营 → 消费异常检测」页面的数据源。
 *
 * 由 services/consumption/anomaly.ts 的 scanConsumptionAnomalies() 即时扫描
 * consumption_records 落库，管理员可 resolve / ignore 处理。
 *
 * unique(user_id, anomaly_type, period_key)：同一用户在同一个检测周期内
 * 同类型异常只保留一条（期初检测结果随窗口滚动失效，不重复刷屏）。
 */
export const consumptionAnomalies = pgTable(
  'consumption_anomalies',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    anomalyType: varchar('anomaly_type', { length: 50 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 8 }).notNull().default('0'),
    severity: varchar('severity', { length: 20 }).notNull().default('warning'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    periodKey: varchar('period_key', { length: 20 }).notNull(),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('consumption_anomalies_user_type_period_uniq').on(
      t.userId,
      t.anomalyType,
      t.periodKey,
    ),
  ],
);

export const consumptionAnomaliesRelations = relations(consumptionAnomalies, ({ one }) => ({
  user: one(users, {
    fields: [consumptionAnomalies.userId],
    references: [users.id],
  }),
}));
