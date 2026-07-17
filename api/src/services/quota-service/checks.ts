// ============================================================
//  3cloud (3C) — 额度预算 检查 & 扣减
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { userQuotas, keyQuotas } from "../../db/schema.js";
import { getActiveUserQuota, getActiveKeyQuota } from "./queries.js";
import type { QuotaInfo, QuotaCheckResult } from "./types.js";

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
