// ============================================================
//  3cloud (3C) — 月度额度重置调度器
//  每月 1 日 00:05 执行: 重置所有月度额度记录的 used_amount
// ============================================================

import { getDb } from "../db/index.js";
import { userQuotas, keyQuotas } from "../db/schema.js";
import { eq, and, sql, gte, lte } from "drizzle-orm";

/**
 * 重置月度额度：将已过期的月度额度 used_amount 重置为 0
 * 并更新 periodStart/periodEnd 到新的月度周期
 */
export async function resetMonthlyQuotas(): Promise<{ userQuotas: number; keyQuotas: number }> {
  const db = getDb();
  const now = new Date();

  // 找出所有已过期的月度额度记录 (periodEnd < now)
  const expiredUserQuotas = await db
    .select({ id: userQuotas.id, periodStart: userQuotas.periodStart, periodEnd: userQuotas.periodEnd })
    .from(userQuotas)
    .where(
      and(
        eq(userQuotas.quotaType, "monthly"),
        sql`${userQuotas.periodEnd} < ${now}`,
      )
    );

  // 重置已过期记录的 used_amount 并更新周期
  let userCount = 0;
  for (const q of expiredUserQuotas) {
    const oldStart = new Date(q.periodStart);
    const oldEnd = new Date(q.periodEnd);
    const monthsDiff = Math.ceil((now.getTime() - oldEnd.getTime()) / (30 * 24 * 60 * 60 * 1000));
    
    if (monthsDiff <= 0) continue;

    // 推进周期到最近的月份
    const newStart = new Date(oldStart);
    newStart.setMonth(newStart.getMonth() + monthsDiff);
    const newEnd = new Date(oldEnd);
    newEnd.setMonth(newEnd.getMonth() + monthsDiff);

    await db
      .update(userQuotas)
      .set({
        usedAmount: "0.000000",
        periodStart: newStart,
        periodEnd: newEnd,
        updatedAt: now,
      })
      .where(eq(userQuotas.id, q.id));
    
    userCount++;
  }

  // Key 级额度同样处理
  const expiredKeyQuotas = await db
    .select({ id: keyQuotas.id, periodStart: keyQuotas.periodStart, periodEnd: keyQuotas.periodEnd })
    .from(keyQuotas)
    .where(sql`${keyQuotas.periodEnd} < ${now}`);

  let keyCount = 0;
  for (const q of expiredKeyQuotas) {
    const oldStart = new Date(q.periodStart);
    const oldEnd = new Date(q.periodEnd);
    const monthsDiff = Math.ceil((now.getTime() - oldEnd.getTime()) / (30 * 24 * 60 * 60 * 1000));
    
    if (monthsDiff <= 0) continue;

    const newStart = new Date(oldStart);
    newStart.setMonth(newStart.getMonth() + monthsDiff);
    const newEnd = new Date(oldEnd);
    newEnd.setMonth(newEnd.getMonth() + monthsDiff);

    await db
      .update(keyQuotas)
      .set({
        usedAmount: "0.000000",
        periodStart: newStart,
        periodEnd: newEnd,
        updatedAt: now,
      })
      .where(eq(keyQuotas.id, q.id));
    
    keyCount++;
  }

  return { userQuotas: userCount, keyQuotas: keyCount };
}
