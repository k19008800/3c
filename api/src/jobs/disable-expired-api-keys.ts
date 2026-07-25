// ============================================================
//  3cloud (3C) — 定时禁用过期 API Key
//  每小时检查一次，禁用过期的 API Key
// ============================================================

import { eq, and, lt, isNotNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys } from "../db/schema.js";

/**
 * 禁用所有过期的 API Key
 * @returns 禁用的 Key 数量
 */
export async function disableExpiredApiKeys(): Promise<number> {
  const db = getDb();
  const now = new Date();

  // 查找所有已过期但仍然启用的 Key
  const expiredKeys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.status, true),
        isNotNull(apiKeys.expiresAt),
        lt(apiKeys.expiresAt, now)
      )
    );

  if (expiredKeys.length === 0) {
    return 0;
  }

  // 批量禁用
  for (const key of expiredKeys) {
    await db
      .update(apiKeys)
      .set({ status: false })
      .where(eq(apiKeys.id, key.id));
  }

  console.log(`[Cron] Disabled ${expiredKeys.length} expired API Keys`);
  return expiredKeys.length;
}
