// ============================================================
//  3cloud (3C) — 异常告警服务 — 类型定义
// ============================================================

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';
export type AlertType = 'failure_rate_spike' | 'quota_exhaustion' | 'suspicious_login' | 'abnormal_call_pattern';

export interface AlertItem {
  id: string; type: AlertType; level: AlertLevel; title: string; message: string;
  createdAt: string; acknowledged: boolean; acknowledgedAt?: string;
  metadata?: Record<string, any>; detailPath?: string;
}

export interface AlertStats {
  total: number; critical: number; error: number; warning: number; info: number; unacknowledged: number;
}

export interface AlertCenterData {
  alerts: AlertItem[]; stats: AlertStats;
}

export const ALERT_CONFIG = {
  failureRateThresholds: { warning: 95, error: 90, critical: 80 },
  quotaUsageThresholds: { warning: 80, error: 90, critical: 95 },
  abnormalCallThreshold: 50,
  abnormalCallWindowMinutes: 10,
  suspiciousLoginWindowDays: 30,
};
