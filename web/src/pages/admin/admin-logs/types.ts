// ── Admin Logs — 共享类型 ──

import type { LogItem } from '@/types'

/** Admin log item — extends user-facing LogItem with user email */
export interface AdminLogItem extends LogItem {
  userEmail?: string
}

/* ── Analytics types ── */

export interface LogAnalyticsSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  timeoutCalls: number
  cancelledCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
  uniqueModels: number
  successRate: number
}

export interface ErrorPattern {
  modelName: string
  errorMessage: string
  count: number
  lastSeen: string
}

export interface TrendPoint {
  date: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
}

export interface HourlyPoint {
  hour: number
  totalCalls: number
  totalTokens: number
}

export interface TopConsumer {
  userId: number
  email: string
  nickname?: string
  totalCalls: number
  totalTokens: number
  totalCost: string
}

/* ── Constants ── */

export const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
  { value: 'cancelled', label: '已取消' },
] as const

export const ANALYTICS_TABS = [
  { key: 'overview' as const, label: '概览', icon: 'BarChart3' },
  { key: 'errors' as const, label: '错误分析', icon: 'XCircle' },
  { key: 'trends' as const, label: '趋势', icon: 'TrendingUp' },
  { key: 'users' as const, label: '用户排行', icon: 'Users' },
] as const

/* ── Helpers ── */

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}

export function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(6)}`
  return `¥${n.toFixed(2)}`
}


