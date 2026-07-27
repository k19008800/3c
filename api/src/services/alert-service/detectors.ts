// ============================================================
//  3cloud (3C) — 异常告警服务 — 检测函数
// ============================================================

import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs, userLoginHistory, userQuotas, apiKeys, keyQuotas } from "../../db/schema.js";
import { type AlertItem, type AlertLevel, ALERT_CONFIG } from "./types.js";

function generateAlertId(type: string, suffix: string | number): string {
  return `${type}_${suffix}_${Date.now()}`;
}

export async function detectFailureRateSpike(userId: number, since: Date): Promise<AlertItem[]> {
  const db = getDb();
  const alerts: AlertItem[] = [];
  const modelStats = await db.select({
    modelName: callLogs.modelName, totalCalls: sql<number>`count(*)::int`,
    failedCalls: sql<number>`count(*) filter (where ${callLogs.status} != 'success')::int`,
  }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, since), sql`${callLogs.modelName} IS NOT NULL`))
    .groupBy(callLogs.modelName).having(sql`count(*)::int >= 10`);

  for (const stat of modelStats) {
    const successRate = ((stat.totalCalls - stat.failedCalls) / stat.totalCalls) * 100;
    const failureRate = 100 - successRate;
    let level: AlertLevel | null = null;
    if (successRate < ALERT_CONFIG.failureRateThresholds.critical) level = 'critical';
    else if (successRate < ALERT_CONFIG.failureRateThresholds.error) level = 'error';
    else if (successRate < ALERT_CONFIG.failureRateThresholds.warning) level = 'warning';
    if (level) alerts.push({ id: generateAlertId('failure_rate_spike', stat.modelName?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'), type: 'failure_rate_spike', level, title: `模型 ${stat.modelName||'未知'} 失败率异常`, message: `模型 ${stat.modelName||'未知'} 近期调用失败率 ${failureRate.toFixed(1)}%（成功 ${stat.totalCalls-stat.failedCalls} / 总计 ${stat.totalCalls}）`, createdAt: new Date().toISOString(), acknowledged: false, metadata: { modelName: stat.modelName, failureRate, totalCalls: stat.totalCalls, failedCalls: stat.failedCalls }, detailPath: `/logs?model=${encodeURIComponent(stat.modelName||'')}&status=failed` });
  }
  return alerts;
}

export async function detectQuotaExhaustion(userId: number): Promise<AlertItem[]> {
  const db = getDb(); const alerts: AlertItem[] = []; const now = new Date();
  const userQuotaList = await db.select().from(userQuotas).where(and(eq(userQuotas.userId, userId), lte(userQuotas.periodStart, now), gte(userQuotas.periodEnd, now))).limit(5);
  for (const quota of userQuotaList) {
    const amount = Number(quota.quotaAmount), used = Number(quota.usedAmount), usagePercent = amount > 0 ? (used / amount) * 100 : 0;
    let level: AlertLevel | null = null;
    if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.critical) level = 'critical';
    else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.error) level = 'error';
    else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.warning) level = 'warning';
    if (level) { const quotaType = quota.quotaType === 'monthly' ? '月度配额' : '一次性配额'; alerts.push({ id: generateAlertId('quota_exhaustion', `user_${quota.id}`), type: 'quota_exhaustion', level, title: `${quotaType}即将耗尽`, message: `您的${quotaType}已使用 ${usagePercent.toFixed(1)}%（${used.toFixed(2)} / ${amount.toFixed(2)}），剩余 ${(amount-used).toFixed(2)}`, createdAt: new Date().toISOString(), acknowledged: false, metadata: { quotaId: quota.id, quotaType: quota.quotaType, quotaUsagePercent: usagePercent, usedAmount: used, totalAmount: amount }, detailPath: '/recharge' }); }
  }
  const activeKeys = await db.select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix }).from(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, true))).limit(20);
  if (activeKeys.length > 0) {
    const keyQuotaList = await db.select({ quota: keyQuotas, keyId: apiKeys.id, keyName: apiKeys.name, keyPrefix: apiKeys.keyPrefix }).from(keyQuotas).innerJoin(apiKeys, eq(keyQuotas.apiKeyId, apiKeys.id)).where(and(eq(apiKeys.userId, userId), lte(keyQuotas.periodStart, now), gte(keyQuotas.periodEnd, now))).limit(20);
    for (const kq of keyQuotaList) {
      const amount = Number(kq.quota.quotaAmount), used = Number(kq.quota.usedAmount), usagePercent = amount > 0 ? (used / amount) * 100 : 0;
      let level: AlertLevel | null = null;
      if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.critical) level = 'critical';
      else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.error) level = 'error';
      else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.warning) level = 'warning';
      if (level) alerts.push({ id: generateAlertId('quota_exhaustion', `key_${kq.quota.id}`), type: 'quota_exhaustion', level, title: `API Key "${kq.keyName||kq.keyPrefix}" 配额即将耗尽`, message: `API Key "${kq.keyName||kq.keyPrefix}" 配额已使用 ${usagePercent.toFixed(1)}%（${used.toFixed(2)} / ${amount.toFixed(2)}）`, createdAt: new Date().toISOString(), acknowledged: false, metadata: { quotaId: kq.quota.id, apiKeyId: kq.keyId, keyName: kq.keyName, quotaUsagePercent: usagePercent }, detailPath: '/api-keys' });
    }
  }
  return alerts;
}

export async function detectSuspiciousLogin(userId: number): Promise<AlertItem[]> {
  const db = getDb(); const alerts: AlertItem[] = [];
  const windowStart = new Date(Date.now() - ALERT_CONFIG.suspiciousLoginWindowDays * 86400000);
  const recentLogins = await db.select().from(userLoginHistory).where(and(eq(userLoginHistory.userId, userId), eq(userLoginHistory.success, true), gte(userLoginHistory.createdAt, windowStart))).orderBy(desc(userLoginHistory.createdAt)).limit(20);
  if (recentLogins.length < 2) return alerts;
  const historicalCities = new Set(recentLogins.slice(1).map(l => l.city).filter(Boolean) as string[]);
  const latestLogin = recentLogins[0];
  if (latestLogin.city && !historicalCities.has(latestLogin.city)) {
    alerts.push({ id: generateAlertId('suspicious_login', latestLogin.id), type: 'suspicious_login', level: 'warning', title: '检测到异地登录', message: `您的账号在 ${latestLogin.city}（IP: ${latestLogin.ip}）有新的登录记录。历史常用登录地：${Array.from(historicalCities).slice(0,3).join('、')||'无'}。`, createdAt: latestLogin.createdAt.toISOString(), acknowledged: false, metadata: { loginId: latestLogin.id, loginIp: latestLogin.ip, loginCity: latestLogin.city, userAgent: latestLogin.userAgent }, detailPath: '/security' });
  }
  return alerts;
}

export async function detectAbnormalCallPattern(userId: number): Promise<AlertItem[]> {
  const db = getDb(); const alerts: AlertItem[] = [];
  const windowStart = new Date(Date.now() - ALERT_CONFIG.abnormalCallWindowMinutes * 60 * 1000);
  const failedCalls = await db.select({ apiKeyId: callLogs.apiKeyId, count: sql<number>`count(*)::int` }).from(callLogs).where(and(eq(callLogs.userId, userId), eq(callLogs.status, 'failed'), gte(callLogs.createdAt, windowStart))).groupBy(callLogs.apiKeyId).having(sql`count(*)::int >= ${ALERT_CONFIG.abnormalCallThreshold}`);
  if (failedCalls.length > 0) {
    const totalFailed = failedCalls.reduce((sum, f) => sum + f.count, 0);
    alerts.push({ id: generateAlertId('abnormal_call_pattern', userId), type: 'abnormal_call_pattern', level: 'error', title: '检测到异常调用模式', message: `最近 ${ALERT_CONFIG.abnormalCallWindowMinutes} 分钟内，您的账号有 ${totalFailed} 次失败调用。`, createdAt: new Date().toISOString(), acknowledged: false, metadata: { abnormalCallCount: totalFailed, timeWindowMinutes: ALERT_CONFIG.abnormalCallWindowMinutes, affectedKeys: failedCalls.map(f => f.apiKeyId) }, detailPath: '/logs?status=failed' });
  }
  return alerts;
}

export async function pushAlertsToStream(alerts: AlertItem[]): Promise<void> {
  if (alerts.length === 0) return;
  try {
    const { pushAlerts } = await import("../../alert-push-service.js");
    await pushAlerts(alerts.map(a => ({ id: a.id, severity: a.level === 'error' ? 'critical' : a.level, title: a.title, message: a.message, metadata: a.metadata || {}, createdAt: new Date(a.createdAt), type: a.type })));
  } catch (err) { console.error("[AlertService] Push error:", err); }
}
