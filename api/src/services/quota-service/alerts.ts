// ============================================================
//  3cloud (3C) — 额度预算 告警 & 信息查询
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { getActiveUserQuota, getActiveKeyQuota } from "./queries.js";
import type { QuotaInfo } from "./types.js";

const ALERT_COOLDOWN = 3600; // 告警冷却时间（秒）

/**
 * 触发额度告警（Redis 去重）
 */
export async function triggerQuotaAlert(
  userId: number,
  quotaInfo: QuotaInfo,
): Promise<void> {
  const redis = getRedis();
  const alertKey = `alert:quota:${userId}`;

  const exists = await redis.get(alertKey);
  if (exists) return;

  // Redis 冷却期去重（1 小时内不重复告警）
  await redis.setex(alertKey, ALERT_COOLDOWN, "1");

  try {
    const { notifyQuotaWarning } = await import("../notification-service.js");
    await notifyQuotaWarning(
      userId,
      quotaInfo.usedAmount,
      quotaInfo.quotaAmount,
      quotaInfo.isExceeded,
    );
  } catch (err) {
    console.error("[Quota] 发送额度告警通知失败:", err);
  }

  console.log(
    `[Quota] 额度告警: 用户 ${userId}, 已用 ${quotaInfo.usedAmount}/${quotaInfo.quotaAmount}, 周期 ${quotaInfo.periodStart} ~ ${quotaInfo.periodEnd}`,
  );
}

// ═══════════════════════════════════════════════
//  5. 获取用户完整额度信息（GET /api/me/quota）
// ═══════════════════════════════════════════════

export async function getUserQuotaInfo(userId: number): Promise<{
  userQuota: QuotaInfo | null;
  keyQuotas: Array<{ keyId: number; keyPrefix: string; quota: QuotaInfo }>;
}> {
  const userQ = await getActiveUserQuota(userId);
  const quotaInfo: QuotaInfo | null = userQ
    ? {
        quotaAmount: userQ.quotaAmount,
        usedAmount: userQ.usedAmount,
        remaining: Math.max(0, Number(userQ.quotaAmount) - Number(userQ.usedAmount)).toFixed(6),
        alertPercent: userQ.alertPercent,
        alertThreshold: (Number(userQ.quotaAmount) * (Number(userQ.alertPercent) / 100)).toFixed(6),
        isAlerting: Number(userQ.usedAmount) >= Number(userQ.quotaAmount) * (Number(userQ.alertPercent) / 100) && Number(userQ.usedAmount) < Number(userQ.quotaAmount),
        isExceeded: Number(userQ.usedAmount) >= Number(userQ.quotaAmount),
        periodStart: userQ.periodStart.toISOString(),
        periodEnd: userQ.periodEnd.toISOString(),
        rpmLimit: userQ.rpmLimit,
        tpmLimit: userQ.tpmLimit,
      }
    : null;

  const db = getDb();
  const { apiKeys: apiKeysTable } = await import("../../db/schema.js");

  // 获取用户的 API Keys 及其额度
  const userKeys = await db
    .select({
      id: apiKeysTable.id,
      keyPrefix: apiKeysTable.keyPrefix,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId));

  const keyQuotaList: Array<{ keyId: number; keyPrefix: string; quota: QuotaInfo }> = [];

  for (const key of userKeys) {
    const kq = await getActiveKeyQuota(key.id);
    if (kq) {
      keyQuotaList.push({
        keyId: key.id,
        keyPrefix: key.keyPrefix,
        quota: {
          quotaAmount: kq.quotaAmount,
          usedAmount: kq.usedAmount,
          remaining: Math.max(0, Number(kq.quotaAmount) - Number(kq.usedAmount)).toFixed(6),
          alertPercent: kq.alertPercent,
          alertThreshold: (Number(kq.quotaAmount) * (Number(kq.alertPercent) / 100)).toFixed(6),
          isAlerting: Number(kq.usedAmount) >= Number(kq.quotaAmount) * (Number(kq.alertPercent) / 100) && Number(kq.usedAmount) < Number(kq.quotaAmount),
          isExceeded: Number(kq.usedAmount) >= Number(kq.quotaAmount),
          periodStart: kq.periodStart.toISOString(),
          periodEnd: kq.periodEnd.toISOString(),
          rpmLimit: null,
          tpmLimit: null,
        },
      });
    }
  }

  return {
    userQuota: quotaInfo,
    keyQuotas: keyQuotaList,
  };
}
