/**
 * 用户消费预算熔断服务（§20.1，migration 0042）
 *
 * 网关在 pre-consume 之前（validate 写入预估费用后）调用 assertWithinBudget()：
 *   - 未设置预算的用户 → 直接放通（向后兼容，不强制人人设预算）；
 *   - 今日/本月已用（consumption_records 聚合，口径同 /me/stats）+ 本次预估 超限额
 *     且 hard_block=true → 抛 BudgetLimitExceededError（429，转发上游前拒绝）；
 *   - 用量达 alert_threshold%（默认 80%）→ 放通但 console.warn 记录告警；
 *   - DB 查询等依赖异常 → fail-open 放通（与 pre-consume 的 Redis 降级语义一致，
 *     不因预算检查自身故障阻断主链路）。
 *
 * 单位换算：consumption_records.cost 为「元」numeric，限额为「分」整数；
 * 统一在聚合结果上 Math.round(yuan*100) 转分后比较，避免浮点误差。
 *
 * @module services/billing
 * @see db/schema/user-budget-settings.ts
 */

import { db, schema } from '../../db/index.js';
import { sql, eq } from 'drizzle-orm';
import { BudgetLimitExceededError } from '../../lib/errors.js';

/** 预算设置行（null = 用户未设置预算 → 不熔断） */
export type UserBudgetRow = typeof schema.userBudgetSettings.$inferSelect;

/** 用量快照（单位：分） */
export interface UserBudgetUsage {
  /** 今日已用（分） */
  todayCents: number;
  /** 本月已用（分） */
  monthCents: number;
}

/** 预算判定结果 */
export interface BudgetDecision extends UserBudgetUsage {
  /** 是否放通（true = 继续后续流程） */
  allowed: boolean;
  /** 是否触发硬阻断（true 时 allowed 必为 false） */
  blocked: boolean;
  /** 阻断周期（blocked=true 时有效） */
  blockedPeriod?: 'daily' | 'monthly';
  /** 是否达到告警阈值（放通，但应记录告警） */
  alert: boolean;
  /** 告警说明（无告警时为空） */
  alertMessage?: string;
}

/**
 * 读取用户预算设置（无记录 → null）
 */
export async function getBudgetSettings(userId: number): Promise<UserBudgetRow | null> {
  const rows = await db.select()
    .from(schema.userBudgetSettings)
    .where(eq(schema.userBudgetSettings.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 聚合用户今日/本月已用消费（单位：分）
 *
 * 口径与 /me/stats 完全一致：今日 = CURRENT_DATE，本月 = date_trunc('month', NOW())。
 * cost 为元 numeric，取 SUM 后在 JS 侧 round(*100) 转分。
 */
export async function getBudgetUsageCents(userId: number): Promise<UserBudgetUsage> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(cost::numeric) FILTER (WHERE created_at >= CURRENT_DATE), 0)::text AS "today_cost",
           COALESCE(SUM(cost::numeric) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0)::text AS "month_cost"
    FROM consumption_records
    WHERE user_id = ${userId}
  `);
  const row = (rows[0] as { today_cost: string; month_cost: string }) || { today_cost: '0', month_cost: '0' };
  return {
    todayCents: Math.round(Number(row.today_cost || 0) * 100),
    monthCents: Math.round(Number(row.month_cost || 0) * 100),
  };
}

/**
 * 预算判定（纯逻辑，便于单测）
 *
 * @param settings - 用户预算设置（null = 未设置）
 * @param usage - 今日/本月已用（分）
 * @param estimatedCents - 本次预估费用（分，>= 0）
 * @returns 判定结果；blocked=true 时由调用方抛错
 */
export function decideBudget(
  settings: UserBudgetRow | null,
  usage: UserBudgetUsage,
  estimatedCents: number,
): BudgetDecision {
  const base: BudgetDecision = {
    ...usage,
    allowed: true,
    blocked: false,
    alert: false,
  };

  // 未设置预算 → 不熔断（向后兼容）
  if (!settings) return base;

  const projectedToday = usage.todayCents + estimatedCents;
  const projectedMonth = usage.monthCents + estimatedCents;
  const threshold = Math.min(Math.max(settings.alertThreshold || 80, 1), 100);

  // 1. 硬阻断：超限额且 hard_block=true → 拒绝
  if (settings.hardBlock) {
    if (settings.dailyLimitCents != null && settings.dailyLimitCents > 0
      && projectedToday > settings.dailyLimitCents) {
      return { ...base, allowed: false, blocked: true, blockedPeriod: 'daily' };
    }
    if (settings.monthlyLimitCents != null && settings.monthlyLimitCents > 0
      && projectedMonth > settings.monthlyLimitCents) {
      return { ...base, allowed: false, blocked: true, blockedPeriod: 'monthly' };
    }
  }

  // 2. 告警：达到阈值百分比 → 放通但记录（不阻断）
  const alerts: string[] = [];
  if (settings.dailyLimitCents != null && settings.dailyLimitCents > 0) {
    const pct = (projectedToday / settings.dailyLimitCents) * 100;
    if (pct >= threshold) {
      alerts.push(`今日预算已用 ${projectedToday}/${settings.dailyLimitCents} 分（${pct.toFixed(0)}%，阈值 ${threshold}%）`);
    }
  }
  if (settings.monthlyLimitCents != null && settings.monthlyLimitCents > 0) {
    const pct = (projectedMonth / settings.monthlyLimitCents) * 100;
    if (pct >= threshold) {
      alerts.push(`本月预算已用 ${projectedMonth}/${settings.monthlyLimitCents} 分（${pct.toFixed(0)}%，阈值 ${threshold}%）`);
    }
  }

  if (alerts.length > 0) {
    return { ...base, alert: true, alertMessage: alerts.join('；') };
  }
  return base;
}

/**
 * 网关 pre-consume 之前调用：预算超限则抛 429；告警则记录日志；异常 fail-open。
 *
 * @param userId - 用户 ID
 * @param estimatedYuan - 本次预估费用（元，>= 0；<=0 直接放通）
 * @throws {BudgetLimitExceededError} 硬阻断（429）
 */
export async function assertWithinBudget(userId: number, estimatedYuan: number): Promise<void> {
  const estimated = Number(estimatedYuan) || 0;
  if (estimated <= 0) return; // 无预估费用 → 无需检查

  try {
    const [settings, usage] = await Promise.all([
      getBudgetSettings(userId),
      getBudgetUsageCents(userId),
    ]);
    const decision = decideBudget(settings, usage, Math.round(estimated * 100));

    if (decision.blocked && decision.blockedPeriod && settings) {
      const period = decision.blockedPeriod;
      const usedCents = period === 'daily' ? decision.todayCents : decision.monthCents;
      const limit = period === 'daily' ? settings.dailyLimitCents! : settings.monthlyLimitCents!;
      throw new BudgetLimitExceededError(period, usedCents, limit);
    }

    if (decision.alert && decision.alertMessage) {
      // 放通仅告警：不阻断主链路，记录供运维/用户端展示
      console.warn(`[budget] user=${userId} ${decision.alertMessage}`);
    }
  } catch (err) {
    // 预算检查自身故障（DB 异常等）→ fail-open 放通；但预算超限错误必须原样上抛
    if (err instanceof BudgetLimitExceededError) throw err;
    console.error(`[budget] check failed for user=${userId}, fail-open:`, err);
  }
}
