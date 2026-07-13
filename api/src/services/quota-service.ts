// ============================================================
//  3cloud (3C) — 额度预算管理服务
//  用户级 & Key 级额度检查、扣减、告警
// ============================================================

import { eq, and, gte, lte, lt, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { userQuotas, keyQuotas, users } from "../db/schema.js";
import { AppError } from "./auth-service.js";

// ── 常量 ──

const ALERT_COOLDOWN = 3600; // 告警冷却时间（秒）

// ── 导出类型 ──

export interface QuotaInfo {
  quotaAmount: string;
  usedAmount: string;
  remaining: string;
  alertPercent: string;
  alertThreshold: string;
  isAlerting: boolean;
  isExceeded: boolean;
  periodStart: string;
  periodEnd: string;
  rpmLimit: number | null;
  tpmLimit: number | null;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  quotaInfo?: QuotaInfo;
  status: "ok" | "alert" | "exceeded";
}

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

// ═══════════════════════════════════════════════
//  2. 检查额度
// ═══════════════════════════════════════════════

/**
 * 检查用户额度（调用扣费前检查）
 * 返回是否允许继续 + 额度信息
 */
export async function checkUserQuota(userId: number): Promise<QuotaCheckResult> {
  const quota = await getActiveUserQuota(userId);
  if (!quota) {
    return { allowed: true, status: "ok" };
  }

  const quotaAmount = Number(quota.quotaAmount);
  const usedAmount = Number(quota.usedAmount);
  const alertPercent = Number(quota.alertPercent);

  if (quotaAmount <= 0) {
    return { allowed: true, status: "ok" };
  }

  const remaining = quotaAmount - usedAmount;
  const alertThreshold = quotaAmount * (alertPercent / 100);
  const isAlerting = usedAmount >= alertThreshold && remaining > 0;
  const isExceeded = usedAmount >= quotaAmount;

  const quotaInfo: QuotaInfo = {
    quotaAmount: quota.quotaAmount,
    usedAmount: quota.usedAmount,
    remaining: Math.max(0, remaining).toFixed(6),
    alertPercent: quota.alertPercent,
    alertThreshold: alertThreshold.toFixed(6),
    isAlerting,
    isExceeded,
    periodStart: quota.periodStart.toISOString(),
    periodEnd: quota.periodEnd.toISOString(),
    rpmLimit: quota.rpmLimit,
    tpmLimit: quota.tpmLimit,
  };

  if (isExceeded) {
    return {
      allowed: false,
      status: "exceeded",
      quotaInfo,
      reason: "额度已用完",
    };
  }

  if (isAlerting) {
    return { allowed: true, status: "alert", quotaInfo };
  }

  return { allowed: true, status: "ok", quotaInfo };
}

/**
 * 检查 Key 级额度
 */
export async function checkKeyQuota(apiKeyId: number): Promise<QuotaCheckResult> {
  const quota = await getActiveKeyQuota(apiKeyId);
  if (!quota) {
    return { allowed: true, status: "ok" };
  }

  const quotaAmount = Number(quota.quotaAmount);
  const usedAmount = Number(quota.usedAmount);

  if (quotaAmount <= 0) {
    return { allowed: true, status: "ok" };
  }

  const remaining = quotaAmount - usedAmount;
  const isExceeded = usedAmount >= quotaAmount;
  const alertThreshold = quotaAmount * (Number(quota.alertPercent) / 100);
  const isAlerting = usedAmount >= alertThreshold && remaining > 0;

  const quotaInfo: QuotaInfo = {
    quotaAmount: quota.quotaAmount,
    usedAmount: quota.usedAmount,
    remaining: Math.max(0, remaining).toFixed(6),
    alertPercent: quota.alertPercent,
    alertThreshold: alertThreshold.toFixed(6),
    isAlerting,
    isExceeded,
    periodStart: quota.periodStart.toISOString(),
    periodEnd: quota.periodEnd.toISOString(),
    rpmLimit: null,
    tpmLimit: null,
  };

  if (isExceeded) {
    return {
      allowed: false,
      status: "exceeded",
      quotaInfo,
      reason: "Key 额度已用完",
    };
  }

  if (isAlerting) {
    return { allowed: true, status: "alert", quotaInfo };
  }

  return { allowed: true, status: "ok", quotaInfo };
}

// ═══════════════════════════════════════════════
//  3. 扣减额度（计费后调用）
// ═══════════════════════════════════════════════

/**
 * 扣减用户额度
 * 在每次成功计费后调用
 */
export async function deductUserQuota(
  userId: number,
  amount: string,
): Promise<void> {
  const quota = await getActiveUserQuota(userId);
  if (!quota) return;

  const db = getDb();
  const amountNum = Number(amount);

  await db
    .update(userQuotas)
    .set({
      usedAmount: sql`${userQuotas.usedAmount}::numeric + ${amountNum.toFixed(6)}`,
      updatedAt: new Date(),
    })
    .where(eq(userQuotas.id, quota.id));
}

/**
 * 扣减 Key 级额度
 */
export async function deductKeyQuota(
  apiKeyId: number,
  amount: string,
): Promise<void> {
  const quota = await getActiveKeyQuota(apiKeyId);
  if (!quota) return;

  const db = getDb();
  const amountNum = Number(amount);

  await db
    .update(keyQuotas)
    .set({
      usedAmount: sql`${keyQuotas.usedAmount}::numeric + ${amountNum.toFixed(6)}`,
      updatedAt: new Date(),
    })
    .where(eq(keyQuotas.id, quota.id));
}

// ═══════════════════════════════════════════════
//  4. 触发额度告警（Redis 去重）
// ═══════════════════════════════════════════════

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
    const { notifyQuotaWarning } = await import("./notification-service.js");
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
  const { apiKeys: apiKeysTable } = await import("../db/schema.js");

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
