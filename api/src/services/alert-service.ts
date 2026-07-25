// ============================================================
//  3cloud (3C) — 异常告警服务
//  聚合多种告警类型：失败率突增、配额耗尽、异地登录、异常调用模式
// ============================================================

import { eq, and, gte, lt, lte, sql, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { callLogs, userLoginHistory, userQuotas, keyQuotas, apiKeys } from "../db/schema.js";

// ── 类型定义 ──

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';
export type AlertType =
  | 'failure_rate_spike'
  | 'quota_exhaustion'
  | 'suspicious_login'
  | 'abnormal_call_pattern';

export interface AlertItem {
  id: string;
  type: AlertType;
  level: AlertLevel;
  title: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  metadata?: Record<string, any>;
  detailPath?: string;
}

export interface AlertStats {
  total: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
  unacknowledged: number;
}

export interface AlertCenterData {
  alerts: AlertItem[];
  stats: AlertStats;
}

// ── 告警检测配置 ──

const ALERT_CONFIG = {
  // 失败率阈值：成功率 < 95% 触发 warning，< 90% 触发 error，< 80% 触发 critical
  failureRateThresholds: { warning: 95, error: 90, critical: 80 },
  // 配额使用率阈值：> 80% warning，> 90% error，> 95% critical
  quotaUsageThresholds: { warning: 80, error: 90, critical: 95 },
  // 异常调用检测：10分钟内失败次数超过阈值
  abnormalCallThreshold: 50,
  abnormalCallWindowMinutes: 10,
  // 异地登录检测：新城市登录
  suspiciousLoginWindowDays: 30,
};

// ── 告警 ID 生成 ──

function generateAlertId(type: AlertType, suffix: string | number): string {
  return `${type}_${suffix}_${Date.now()}`;
}

// ── 检测失败率突增 ──

async function detectFailureRateSpike(
  userId: number,
  since: Date
): Promise<AlertItem[]> {
  const db = getDb();
  const alerts: AlertItem[] = [];

  // 按模型聚合失败率
  const modelStats = await db
    .select({
      modelName: callLogs.modelName,
      totalCalls: sql<number>`count(*)::int`,
      failedCalls: sql<number>`count(*) filter (where ${callLogs.status} != 'success')::int`,
    })
    .from(callLogs)
    .where(
      and(
        eq(callLogs.userId, userId),
        gte(callLogs.createdAt, since),
        sql`${callLogs.modelName} IS NOT NULL`
      )
    )
    .groupBy(callLogs.modelName)
    .having(sql`count(*)::int >= 10`); // 至少 10 次调用才统计

  for (const stat of modelStats) {
    const successRate = ((stat.totalCalls - stat.failedCalls) / stat.totalCalls) * 100;
    const failureRate = 100 - successRate;

    let level: AlertLevel | null = null;
    if (successRate < ALERT_CONFIG.failureRateThresholds.critical) {
      level = 'critical';
    } else if (successRate < ALERT_CONFIG.failureRateThresholds.error) {
      level = 'error';
    } else if (successRate < ALERT_CONFIG.failureRateThresholds.warning) {
      level = 'warning';
    }

    if (level) {
      alerts.push({
        id: generateAlertId('failure_rate_spike', stat.modelName?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'),
        type: 'failure_rate_spike',
        level,
        title: `模型 ${stat.modelName || '未知'} 失败率异常`,
        message: `模型 ${stat.modelName || '未知'} 在近期调用中失败率为 ${failureRate.toFixed(1)}%（成功 ${stat.totalCalls - stat.failedCalls} / 总计 ${stat.totalCalls}），请检查模型配置或厂商状态。`,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        metadata: {
          modelName: stat.modelName,
          failureRate: failureRate,
          totalCalls: stat.totalCalls,
          failedCalls: stat.failedCalls,
        },
        detailPath: `/logs?model=${encodeURIComponent(stat.modelName || '')}&status=failed`,
      });
    }
  }

  return alerts;
}

// ── 检测配额即将耗尽 ──

async function detectQuotaExhaustion(userId: number): Promise<AlertItem[]> {
  const db = getDb();
  const alerts: AlertItem[] = [];
  const now = new Date();

  // 用户级配额
  const userQuotaList = await db
    .select()
    .from(userQuotas)
    .where(
      and(
        eq(userQuotas.userId, userId),
        lte(userQuotas.periodStart, now),
        gte(userQuotas.periodEnd, now)
      )
    )
    .limit(5);

  for (const quota of userQuotaList) {
    const amount = Number(quota.quotaAmount);
    const used = Number(quota.usedAmount);
    const usagePercent = amount > 0 ? (used / amount) * 100 : 0;

    let level: AlertLevel | null = null;
    if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.critical) {
      level = 'critical';
    } else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.error) {
      level = 'error';
    } else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.warning) {
      level = 'warning';
    }

    if (level) {
      const quotaType = quota.quotaType === 'monthly' ? '月度配额' : '一次性配额';
      alerts.push({
        id: generateAlertId('quota_exhaustion', `user_${quota.id}`),
        type: 'quota_exhaustion',
        level,
        title: `${quotaType}即将耗尽`,
        message: `您的${quotaType}已使用 ${usagePercent.toFixed(1)}%（${used.toFixed(2)} / ${amount.toFixed(2)}），剩余 ${(amount - used).toFixed(2)}。建议及时充值或调整使用策略。`,
        createdAt: new Date().toISOString(),
        acknowledged: false,
        metadata: {
          quotaId: quota.id,
          quotaType: quota.quotaType,
          quotaUsagePercent: usagePercent,
          usedAmount: used,
          totalAmount: amount,
        },
        detailPath: '/recharge',
      });
    }
  }

  // Key 级配额
  const activeKeys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, true)))
    .limit(20);

  if (activeKeys.length > 0) {
    const keyQuotaList = await db
      .select({
        quota: keyQuotas,
        keyId: apiKeys.id,
        keyName: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
      })
      .from(keyQuotas)
      .innerJoin(apiKeys, eq(keyQuotas.apiKeyId, apiKeys.id))
      .where(
        and(
          eq(apiKeys.userId, userId),
          lte(keyQuotas.periodStart, now),
          gte(keyQuotas.periodEnd, now)
        )
      )
      .limit(20);

    for (const kq of keyQuotaList) {
      const amount = Number(kq.quota.quotaAmount);
      const used = Number(kq.quota.usedAmount);
      const usagePercent = amount > 0 ? (used / amount) * 100 : 0;

      let level: AlertLevel | null = null;
      if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.critical) {
        level = 'critical';
      } else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.error) {
        level = 'error';
      } else if (usagePercent >= ALERT_CONFIG.quotaUsageThresholds.warning) {
        level = 'warning';
      }

      if (level) {
        alerts.push({
          id: generateAlertId('quota_exhaustion', `key_${kq.quota.id}`),
          type: 'quota_exhaustion',
          level,
          title: `API Key "${kq.keyName || kq.keyPrefix}" 配额即将耗尽`,
          message: `API Key "${kq.keyName || kq.keyPrefix}" 的配额已使用 ${usagePercent.toFixed(1)}%（${used.toFixed(2)} / ${amount.toFixed(2)}），剩余 ${(amount - used).toFixed(2)}。`,
          createdAt: new Date().toISOString(),
          acknowledged: false,
          metadata: {
            quotaId: kq.quota.id,
            apiKeyId: kq.keyId,
            keyName: kq.keyName,
            quotaUsagePercent: usagePercent,
          },
          detailPath: '/api-keys',
        });
      }
    }
  }

  return alerts;
}

// ── 检测异地登录 ──

async function detectSuspiciousLogin(userId: number): Promise<AlertItem[]> {
  const db = getDb();
  const alerts: AlertItem[] = [];

  const windowStart = new Date(
    Date.now() - ALERT_CONFIG.suspiciousLoginWindowDays * 86400000
  );

  // 获取最近的登录历史
  const recentLogins = await db
    .select()
    .from(userLoginHistory)
    .where(
      and(
        eq(userLoginHistory.userId, userId),
        eq(userLoginHistory.success, true),
        gte(userLoginHistory.createdAt, windowStart)
      )
    )
    .orderBy(desc(userLoginHistory.createdAt))
    .limit(20);

  if (recentLogins.length < 2) {
    return alerts;
  }

  // 获取历史登录城市
  const historicalCities = new Set(
    recentLogins.slice(1).map((l) => l.city).filter(Boolean) as string[]
  );

  // 检查最近一次登录是否来自新城市
  const latestLogin = recentLogins[0];
  if (latestLogin.city && !historicalCities.has(latestLogin.city)) {
    const historicalCitiesStr = Array.from(historicalCities).slice(0, 3).join('、') || '无';

    alerts.push({
      id: generateAlertId('suspicious_login', latestLogin.id),
      type: 'suspicious_login',
      level: 'warning',
      title: '检测到异地登录',
      message: `您的账号在 ${latestLogin.city}（IP: ${latestLogin.ip}）有新的登录记录。历史常用登录地：${historicalCitiesStr}。如非本人操作，请立即修改密码。`,
      createdAt: latestLogin.createdAt.toISOString(),
      acknowledged: false,
      metadata: {
        loginId: latestLogin.id,
        loginIp: latestLogin.ip,
        loginCity: latestLogin.city,
        userAgent: latestLogin.userAgent,
      },
      detailPath: '/security',
    });
  }

  return alerts;
}

// ── 检测异常调用模式 ──

async function detectAbnormalCallPattern(
  userId: number
): Promise<AlertItem[]> {
  const db = getDb();
  const alerts: AlertItem[] = [];

  const windowStart = new Date(
    Date.now() - ALERT_CONFIG.abnormalCallWindowMinutes * 60 * 1000
  );

  // 统计短时间内的失败调用
  const failedCalls = await db
    .select({
      apiKeyId: callLogs.apiKeyId,
      count: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .where(
      and(
        eq(callLogs.userId, userId),
        eq(callLogs.status, 'failed'),
        gte(callLogs.createdAt, windowStart)
      )
    )
    .groupBy(callLogs.apiKeyId)
    .having(sql`count(*)::int >= ${ALERT_CONFIG.abnormalCallThreshold}`);

  if (failedCalls.length > 0) {
    const totalFailed = failedCalls.reduce((sum, f) => sum + f.count, 0);

    alerts.push({
      id: generateAlertId('abnormal_call_pattern', userId),
      type: 'abnormal_call_pattern',
      level: 'error',
      title: '检测到异常调用模式',
      message: `在最近 ${ALERT_CONFIG.abnormalCallWindowMinutes} 分钟内，您的账号有 ${totalFailed} 次失败调用。可能存在配置错误或异常访问，请检查 API Key 配置或调用日志。`,
      createdAt: new Date().toISOString(),
      acknowledged: false,
      metadata: {
        abnormalCallCount: totalFailed,
        timeWindowMinutes: ALERT_CONFIG.abnormalCallWindowMinutes,
        affectedKeys: failedCalls.map((f) => f.apiKeyId),
      },
      detailPath: '/logs?status=failed',
    });
  }

  return alerts;
}

// ── 推送告警（内部调用）──

async function pushAlertsToStream(alerts: AlertItem[]): Promise<void> {
  if (alerts.length === 0) return;

  try {
    const { pushAlerts } = await import("./alert-push-service.js");
    await pushAlerts(
      alerts.map((a) => ({
        id: a.id,
        severity: a.level === 'error' ? 'critical' : a.level,
        title: a.title,
        message: a.message,
        metadata: a.metadata || {},
        createdAt: new Date(a.createdAt),
        type: a.type,
      }))
    );
  } catch (err) {
    console.error("[AlertService] Push error:", err);
  }
}

// ── 获取用户告警中心数据 ──

export async function getUserAlerts(userId: number): Promise<AlertCenterData> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 3600000);
  const since7d = new Date(now.getTime() - 7 * 86400000);

  // 并行检测所有告警类型
  const [failureAlerts, quotaAlerts, loginAlerts, abnormalAlerts] =
    await Promise.all([
      detectFailureRateSpike(userId, since24h),
      detectQuotaExhaustion(userId),
      detectSuspiciousLogin(userId),
      detectAbnormalCallPattern(userId),
    ]);

  // 合并并按级别和时间排序
  const allAlerts = [
    ...failureAlerts,
    ...quotaAlerts,
    ...loginAlerts,
    ...abnormalAlerts,
  ].sort((a, b) => {
    // 先按级别排序（critical > error > warning > info）
    const levelOrder: Record<AlertLevel, number> = {
      critical: 0,
      error: 1,
      warning: 2,
      info: 3,
    };
    if (levelOrder[a.level] !== levelOrder[b.level]) {
      return levelOrder[a.level] - levelOrder[b.level];
    }
    // 再按时间排序（新的在前）
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // 统计
  const stats: AlertStats = {
    total: allAlerts.length,
    critical: allAlerts.filter((a) => a.level === 'critical').length,
    error: allAlerts.filter((a) => a.level === 'error').length,
    warning: allAlerts.filter((a) => a.level === 'warning').length,
    info: allAlerts.filter((a) => a.level === 'info').length,
    unacknowledged: allAlerts.filter((a) => !a.acknowledged).length,
  };

  // 推送新告警到 WebSocket
  await pushAlertsToStream(allAlerts.filter((a) => !a.acknowledged));

  return { alerts: allAlerts, stats };
}

// ── 确认/忽略告警 ──

export async function acknowledgeAlert(
  userId: number,
  alertId: string,
  action: 'acknowledge' | 'ignore'
): Promise<boolean> {
  // TODO: 实现持久化存储（可使用 Redis 或数据库）
  // 当前版本：仅在内存中标记（重启后重置）
  // 生产环境建议：使用 Redis 或创建 alerts 表持久化

  // 简单实现：返回成功
  // 完整实现需要：
  // 1. 验证 alertId 是否属于该用户
  // 2. 更新持久化存储中的 acknowledged 状态
  // 3. 记录操作日志

  return true;
}
