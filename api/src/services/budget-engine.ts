import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { userBudgetSettings, budgetAlertLogs, budgetBlockLogs } from "../db/schema/user-budget";

/**
 * 消费预算引擎 对齐 SPEC-§20.1
 * 预算检查在网关中间件中调用：预算检查 → 速率限制
 * 边界：预算 0 = 不限制；hard 超限熔断；soft 仅预警
 */

/** 获取或创建用户预算设置（首次访问用默认值 0=不限制） */
export async function getOrCreateBudget(userId: number): Promise<any> {
  let rec = await db.select().from(userBudgetSettings).where(eq(userBudgetSettings.userId, userId)).limit(1);
  if (!rec[0]) {
    const created = await db.insert(userBudgetSettings).values({ userId }).returning();
    rec = created;
  }
  return rec[0];
}

/** 检查预算，返回拦截错误码或 null */
export async function checkBudget(userId: number, modelId: number | null, maxTokens: number, keyId: number | null): Promise<string | null> {
  const rec = await db.select().from(userBudgetSettings).where(eq(userBudgetSettings.userId, userId)).limit(1);
  if (!rec[0]) return null; // 无预算记录 → 放行
  const s = rec[0];
  const monthlyBudget = Number(s.monthlyBudget);
  const dailyBudget = Number(s.dailyBudget);
  const currentMonthSpent = Number(s.currentMonthSpent);
  const currentDaySpent = Number(s.currentDaySpent);

  // 1. 熔断状态检查
  if (s.blocked) {
    // 检查 key 是否豁免
    let exemptKeys: number[] = [];
    try { exemptKeys = JSON.parse(s.exemptKeys || "[]"); } catch { /* 非法 JSON 视为空 */ }
    if (keyId && exemptKeys.includes(keyId)) return null; // 豁免 Key 放行
    return "QUOTA_EXCEEDED";
  }

  // 估算本次费用
  const estCost = await estimateCost(modelId, maxTokens);

  // 2. 日预算检查（dailyBudget > 0）
  if (dailyBudget > 0 && (currentDaySpent + estCost) >= dailyBudget) {
    return "DAILY_QUOTA_EXCEEDED";
  }

  // 3. 月预算检查
  if (monthlyBudget > 0) {
    const percent = (currentMonthSpent / monthlyBudget) * 100;
    // 预警
    const thresholds = (s.alertThresholds || "80").split(",").map(Number).filter((n) => !isNaN(n));
    for (const t of thresholds) {
      if (percent >= t && (s.lastAlertedAt === null || t > s.lastAlertedAt)) {
        await db.insert(budgetAlertLogs).values({ userId, budgetSettingsId: s.id, threshold: t, currentSpent: String(currentMonthSpent), monthlyBudget: s.monthlyBudget });
        await db.update(userBudgetSettings).set({ lastAlertedAt: t }).where(eq(userBudgetSettings.id, s.id));
        // 通知（站内/邮件由通知服务处理，此处简化为记录）
      }
    }
    // 硬上限熔断
    if (s.budgetType === "hard" && s.autoBlock && (currentMonthSpent + estCost) >= monthlyBudget) {
      await db.update(userBudgetSettings)
        .set({ blocked: true, blockedAt: new Date(), updatedAt: new Date() })
        .where(eq(userBudgetSettings.id, s.id));
      await db.insert(budgetBlockLogs).values({ userId, budgetSettingsId: s.id, action: "blocked", reason: "月预算超限自动熔断", previousMonthlyBudget: s.monthlyBudget, newMonthlyBudget: s.monthlyBudget });
      return "QUOTA_EXCEEDED";
    }
  }
  return null;
}

/** 估算模型最大费用（按 max_tokens 输出价粗估） */
async function estimateCost(modelId: number | null, maxTokens: number): Promise<number> {
  if (!modelId || !maxTokens) return 0;
  try {
    const r = await pool.query(
      `SELECT COALESCE((SELECT output_price FROM models WHERE id=$1), 0)::float AS op`, [modelId]);
    return (r.rows[0]?.op ?? 0) * (maxTokens / 1000);
  } catch {
    return 0;
  }
}

/** 记录消费（proxy 计费后回写） */
export async function recordSpend(userId: number, cost: number) {
  // 检查周期是否需要重置
  await ensurePeriodReset(userId);
  // 原子累加
  await pool.query(
    `UPDATE user_budget_settings
     SET current_month_spent = current_month_spent + $2,
         current_day_spent = current_day_spent + $2,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, cost],
  );
}

/** 周期重置：日预算每天清零；月预算每月 1 日清零并解除熔断 */
export async function ensurePeriodReset(userId: number) {
  await pool.query(
    `UPDATE user_budget_settings
     SET current_day_spent = CASE WHEN period_start IS NULL OR period_start != CURRENT_DATE THEN 0 ELSE current_day_spent END,
         current_month_spent = CASE WHEN date_trunc('month', COALESCE(period_start, CURRENT_DATE)) != date_trunc('month', CURRENT_DATE) THEN 0 ELSE current_month_spent END,
         blocked = CASE WHEN date_trunc('month', COALESCE(period_start, CURRENT_DATE)) != date_trunc('month', CURRENT_DATE) THEN false ELSE blocked END,
         blocked_at = CASE WHEN date_trunc('month', COALESCE(period_start, CURRENT_DATE)) != date_trunc('month', CURRENT_DATE) THEN NULL ELSE blocked_at END,
         period_start = CASE WHEN date_trunc('month', COALESCE(period_start, CURRENT_DATE)) != date_trunc('month', CURRENT_DATE) THEN CURRENT_DATE ELSE period_start END,
         last_alerted_at = CASE WHEN date_trunc('month', COALESCE(period_start, CURRENT_DATE)) != date_trunc('month', CURRENT_DATE) THEN NULL ELSE last_alerted_at END,
         updated_at = NOW()
     WHERE user_id=$1`, [userId]);
}

/** 解除熔断 */
export async function unblockUser(userId: number, operatorId: number | null, action: string, reason: string) {
  const rec = await db.select().from(userBudgetSettings).where(eq(userBudgetSettings.userId, userId)).limit(1);
  if (!rec[0]) return;
  await db.update(userBudgetSettings)
    .set({ blocked: false, blockedAt: null, updatedAt: new Date() })
    .where(eq(userBudgetSettings.id, rec[0].id));
  await db.insert(budgetBlockLogs).values({
    userId, budgetSettingsId: rec[0].id, action, reason,
    operatorId, previousMonthlyBudget: rec[0].monthlyBudget, newMonthlyBudget: rec[0].monthlyBudget,
  });
}
