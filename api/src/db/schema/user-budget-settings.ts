import { pgTable, serial, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * 用户消费预算设置（§20.1 用户预算熔断后端，migration 0042）
 *
 * 每个用户至多一行（user_id 唯一）。未设置记录的用户不做预算熔断（向后兼容）。
 *
 * 金额单位：整数「分」（daily_limit_cents / monthly_limit_cents），与
 * consumption_records.cost（元，numeric）比较时由预算服务统一 ×100 换算为分。
 *
 * 熔断语义（网关 pre-consume 之前检查，见 services/billing/budget.ts）：
 *   - hard_block=true 且 今日/本月已用 + 本次预估 超限额 → 429 拒绝；
 *   - 用量达到 alert_threshold%（默认 80%）→ 放通但记录告警日志；
 *   - 检查依赖（DB/Redis）异常 → fail-open 放通，不因预算检查故障阻断主链路。
 */
export const userBudgetSettings = pgTable(
  'user_budget_settings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** 日消费上限（分）；NULL = 不限 */
    dailyLimitCents: integer('daily_limit_cents'),
    /** 月消费上限（分）；NULL = 不限 */
    monthlyLimitCents: integer('monthly_limit_cents'),
    /** 告警阈值百分比（1–100），达到即记录告警但不阻断，默认 80 */
    alertThreshold: integer('alert_threshold').notNull().default(80),
    /** 超限是否硬阻断：true=超限额 429 拒绝；false=仅告警不阻断 */
    hardBlock: boolean('hard_block').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // 每用户至多一行
    uniqueIndex('uq_user_budget_user').on(t.userId),
  ],
);

export type UserBudgetSetting = typeof userBudgetSettings.$inferSelect;
export type NewUserBudgetSetting = typeof userBudgetSettings.$inferInsert;
