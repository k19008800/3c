// ============================================================
//  3cloud (3C) — 异常告警服务 — 用户端 API
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { auditLogs } from "../../db/schema.js";
import { logger } from "../../logger.js";
import { detectFailureRateSpike, detectQuotaExhaustion, detectSuspiciousLogin, detectAbnormalCallPattern, pushAlertsToStream } from "./detectors.js";
import { type AlertItem, type AlertCenterData, type AlertStats, type AlertLevel } from "./types.js";

export async function getUserAlerts(userId: number): Promise<AlertCenterData> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 3600000);

  const [failureAlerts, quotaAlerts, loginAlerts, abnormalAlerts] = await Promise.all([
    detectFailureRateSpike(userId, since24h),
    detectQuotaExhaustion(userId),
    detectSuspiciousLogin(userId),
    detectAbnormalCallPattern(userId),
  ]);

  const allAlerts = [...failureAlerts, ...quotaAlerts, ...loginAlerts, ...abnormalAlerts].sort((a, b) => {
    const levelOrder: Record<AlertLevel, number> = { critical: 0, error: 1, warning: 2, info: 3 };
    if (levelOrder[a.level] !== levelOrder[b.level]) return levelOrder[a.level] - levelOrder[b.level];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const stats: AlertStats = {
    total: allAlerts.length, critical: allAlerts.filter(a => a.level === 'critical').length,
    error: allAlerts.filter(a => a.level === 'error').length, warning: allAlerts.filter(a => a.level === 'warning').length,
    info: allAlerts.filter(a => a.level === 'info').length, unacknowledged: allAlerts.filter(a => !a.acknowledged).length,
  };

  await pushAlertsToStream(allAlerts.filter(a => !a.acknowledged));
  return { alerts: allAlerts, stats };
}

export async function acknowledgeAlert(userId: number, alertId: string, action: 'acknowledge' | 'ignore'): Promise<boolean> {
  try {
    const { getRedis } = await import("../../redis.js");
    const redis = getRedis();
    const key = `alert:ack:${userId}:${alertId}`;
    if (action === 'acknowledge') await redis.setex(key, 86400 * 30, 'acknowledged');
    else await redis.setex(key, 86400 * 7, 'ignored');

    const db = getDb();
    await db.insert(auditLogs).values({ operatorId: userId, action: action === 'acknowledge' ? 'acknowledge_alert' : 'ignore_alert', targetType: 'alert', targetId: userId, after: { alertId, action }, description: `${action === 'acknowledge' ? '确认' : '忽略'}告警: ${alertId}`, ip: '' });
    return true;
  } catch (err) { logger.error({ err, userId, alertId, action }, "[AlertService] 持久化告警状态失败"); return false; }
}
