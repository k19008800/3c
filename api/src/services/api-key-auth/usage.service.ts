// ============================================================
//  API Key Auth — 使用统计（更新用量、重置统计）
// ============================================================

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { apiKeys } from "../../db/schema.js";
// 注意：apiKeyUsageStats 在原始文件中有引用定义但未导出，
// 保持与原文件一致，不做引入变更

/**
 * 更新 API Key 使用统计
 */
export async function updateUsageStats(
  keyId: number,
  cost: number,
  tokens: number,
  success: boolean = true
): Promise<void> {
  const db = getDb();
  const now = new Date();

  // 更新每日/每月使用量
  await db
    .update(apiKeys)
    .set({
      dailyUsage: sql`${apiKeys.dailyUsage} + ${cost}`,
      monthlyUsage: sql`${apiKeys.monthlyUsage} + ${cost}`,
    })
    .where(eq(apiKeys.id, keyId))
    .execute();

  // 更新额度余额（如果有）
  if (cost > 0) {
    await db
      .update(apiKeys)
      .set({
        quotaBalance: sql`${apiKeys.quotaBalance} - ${cost}`,
      })
      .where(eq(apiKeys.id, keyId))
      .execute();
  }

  // 记录到使用统计表
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [existingStat] = await db
    .select({ id: apiKeyUsageStats.id })
    .from(apiKeyUsageStats)
    .where(
      and(
        eq(apiKeyUsageStats.apiKeyId, keyId),
        eq(apiKeyUsageStats.date, today)
      )
    )
    .limit(1);

  if (existingStat) {
    await db
      .update(apiKeyUsageStats)
      .set({
        calls: sql`${apiKeyUsageStats.calls} + 1`,
        tokens: sql`${apiKeyUsageStats.tokens} + ${tokens}`,
        cost: sql`${apiKeyUsageStats.cost} + ${cost}`,
      })
      .where(eq(apiKeyUsageStats.id, existingStat.id))
      .execute();
  } else {
    await db
      .insert(apiKeyUsageStats)
      .values({
        apiKeyId: keyId,
        date: today,
        calls: 1,
        tokens: tokens,
        cost: cost,
      })
      .execute();
  }
}

/**
 * 重置每日/每月使用统计（如果需要）
 */
export async function resetUsageStatsIfNeeded(
  keyId: number,
  lastResetDaily?: Date | null,
  lastResetMonthly?: Date | null
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 重置每日统计
  if (!lastResetDaily || lastResetDaily < today) {
    await db
      .update(apiKeys)
      .set({
        dailyUsage: 0,
        lastResetDaily: today,
      })
      .where(eq(apiKeys.id, keyId))
      .execute();
  }

  // 重置每月统计
  if (!lastResetMonthly || lastResetMonthly < firstDayOfMonth) {
    await db
      .update(apiKeys)
      .set({
        monthlyUsage: 0,
        lastResetMonthly: firstDayOfMonth,
      })
      .where(eq(apiKeys.id, keyId))
      .execute();
  }
}
