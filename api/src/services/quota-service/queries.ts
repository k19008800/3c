// ============================================================
//  3cloud (3C) — 额度预算 活跃额度查询
// ============================================================

import { eq, and, gte, lte, lt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { userQuotas, keyQuotas } from "../../db/schema.js";

// ═══════════════════════════════════════════════
//  1. 获取用户活跃额度
// ═══════════════════════════════════════════════

/**
 * 获取用户当前计费周期内的活跃额度配置
 * 优先级：admin 设置的额度 > agent 设置的额度
 * 同角色下：按月额度（monthly）> 总额度（total）
 * 返回最新的一个活跃额度
 */
export async function getActiveUserQuota(userId: number): Promise<typeof userQuotas.$inferSelect | null> {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select()
    .from(userQuotas)
    .where(
      and(
        eq(userQuotas.userId, userId),
        lte(userQuotas.periodStart, now),
        gte(userQuotas.periodEnd, now),
      )
    )
    .orderBy(sql`CASE WHEN ${userQuotas.setByRole} = 'admin' THEN 1 ELSE 2 END, CASE WHEN ${userQuotas.quotaType} = 'monthly' THEN 1 ELSE 2 END`)
    .limit(1);

  return rows[0] ?? null;
}

/**
 * 获取 Key 级活跃额度
 */
export async function getActiveKeyQuota(apiKeyId: number): Promise<typeof keyQuotas.$inferSelect | null> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select()
    .from(keyQuotas)
    .where(
      and(
        eq(keyQuotas.apiKeyId, apiKeyId),
        lte(keyQuotas.periodStart, now),
        gte(keyQuotas.periodEnd, now),
      )
    )
    .limit(1);

  return row ?? null;
}
