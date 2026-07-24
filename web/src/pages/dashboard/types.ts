// Dashboard 页面的类型定义

interface QuotaInfo {
  quotaType?: string
  quotaAmount: string
  usedAmount: string
  alertPercent?: string
  periodStart: string
  periodEnd: string
  usagePercent?: number
}

type TimeRange = 'today' | 'week' | 'month'

interface AggUsageStats {
  totalCalls: number
  totalTokens: number
  totalCost: string
  successCalls: number
  failedCalls: number
  successRate: number
}

interface AggDailySeries {
  date: string
  totalCalls: number
  totalTokens: number
  totalCost: string
}

interface AggModelBreakdown {
  modelName: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  successCount: number
  failedCount: number
}

interface KeyActivity {
  id: number
  name: string
  keyPrefix: string
  callCount: number
  totalTokens: number
  totalCost: string
  successCount: number
  failedCount: number
}

export type {
  QuotaInfo,
  TimeRange,
  AggUsageStats,
  AggDailySeries,
  AggModelBreakdown,
  KeyActivity,
}