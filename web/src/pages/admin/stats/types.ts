// ──── Stats Shared Types ────

export interface OverviewStats {
  period: string
  startDate: string
  endDate: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
  successRate: number
}

export interface ModelStatItem {
  modelName: string
  displayName: string
  totalCalls: number
  successCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  successRate: number
}

export interface VendorStatItem {
  vendorName: string
  totalCalls: number
  successCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueModels: number
  uniqueUsers: number
  successRate: number
}

export interface HourlyItem {
  hour: number
  totalCalls: number
  successCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
}

export interface TrendItem {
  date: string
  totalCalls: number
  successCalls: number
  successRate: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

export interface UserStatItem {
  userId: number
  email: string
  nickname?: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  successRate: number
}

export interface AggSeriesItem {
  timeBucket: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

export interface AggSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
  uniqueModels: number
}

export interface ModelBreakdownItem {
  name: string
  dimension: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

export interface VendorBreakdownItem {
  name: string
  dimension: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

export type StatsTab = 'overview' | 'models' | 'users' | 'trends'

export const PERIODS = [
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: '90d', label: '近90天' },
] as const

export const GRANULARITIES = [
  { value: 'hour', label: '按小时' },
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
] as const

// ──── Helpers ────

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

export function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(6)}`
  if (n >= 1000) return `¥${(n / 1000).toFixed(1)}k`
  return `¥${n.toFixed(2)}`
}
