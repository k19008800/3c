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

  // PERF: 使用单条 UPDATE 批量重置，消除逐行 UPDATE
  const [userResult] = await db
    .update(userQuotas)
    .set({
      usedAmount: "0.000000",
      updatedAt: now,
    })
    .where(
      and(
        eq(userQuotas.quotaType, "monthly"),
        sql`${userQuotas.periodEnd} < ${now}`,
      )
    )
    .returning({ id: userQuotas.id });

  // PERF: Key 级额度同样使用单条 UPDATE
  const [keyResult] = await db
    .update(keyQuotas)
    .set({
      usedAmount: "0.000000",
      updatedAt: now,
    })
    .where(sql`${keyQuotas.periodEnd} < ${now}`)
    .returning({ id: keyQuotas.id });

  const userCount = Array.isArray(userResult) ? userResult.length : 0;
  const keyCount = Array.isArray(keyResult) ? keyResult.length : 0;

  return { userQuotas: userCount, keyQuotas: keyCount };
}
