// ── 异常告警类型定义 ──

/**
 * 告警级别
 */
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical'

/**
 * 告警类型
 */
export type AlertType =
  | 'failure_rate_spike'      // 失败率突增（成功率 < 95%）
  | 'quota_exhaustion'        // 配额即将耗尽（使用率 > 80%）
  | 'suspicious_login'        // 异地登录提醒（新 IP/新城市）
  | 'abnormal_call_pattern'   // 异常调用模式（短时间内大量失败）

/**
 * 告警项
 */
export interface AlertItem {
  id: string
  type: AlertType
  level: AlertLevel
  title: string
  message: string
  /** 告警时间 */
  createdAt: string
  /** 是否已确认 */
  acknowledged: boolean
  /** 确认时间 */
  acknowledgedAt?: string
  /** 关联数据（用于跳转详情） */
  metadata?: {
    /** 关联的 API Key ID */
    apiKeyId?: number
    /** 关联的模型名称 */
    modelName?: string
    /** 失败率百分比 */
    failureRate?: number
    /** 配额使用率 */
    quotaUsagePercent?: number
    /** 登录 IP */
    loginIp?: string
    /** 登录城市 */
    loginCity?: string
    /** 异常调用次数 */
    abnormalCallCount?: number
    /** 时间窗口（分钟） */
    timeWindowMinutes?: number
  }
  /** 跳转路径 */
  detailPath?: string
}

/**
 * 告警统计
 */
export interface AlertStats {
  total: number
  critical: number
  error: number
  warning: number
  info: number
  unacknowledged: number
}

/**
 * 告警中心数据
 */
export interface AlertCenterData {
  alerts: AlertItem[]
  stats: AlertStats
}

/**
 * 告警确认/忽略请求
 */
export interface AlertAcknowledgeRequest {
  alertId: string
  action: 'acknowledge' | 'ignore'
}
