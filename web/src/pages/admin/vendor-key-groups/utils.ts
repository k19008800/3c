import type { KeyItem } from './hooks/useVendorKeyGroups'

// Health calculation
export type HealthLevel = 'healthy' | 'warn' | 'danger'

export interface HealthInfo {
  level: HealthLevel
  rate: number | null
  label: string
  color: string
  bgColor: string
}

export function calcHealth(item: KeyItem): HealthInfo {
  if (item.totalCalls < 10) {
    return {
      level: 'warn',
      rate: null,
      label: '数据不足',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100'
    }
  }
  
  const rate = item.totalCalls > 0 ? (item.successCalls / item.totalCalls) * 100 : 0
  
  let level: HealthLevel = 'danger'
  let label = '危险'
  
  if (rate >= 90 && item.consecutiveFailures < 3) {
    level = 'healthy'
    label = '健康'
  } else if (rate >= 70 && item.consecutiveFailures < 10) {
    level = 'warn'
    label = '警告'
  }
  
  const colors = {
    healthy: { text: 'text-green-700', bg: 'bg-green-100' },
    warn: { text: 'text-yellow-700', bg: 'bg-yellow-100' },
    danger: { text: 'text-red-700', bg: 'bg-red-100' }
  }
  
  return {
    level,
    rate,
    label,
    color: colors[level].text,
    bgColor: colors[level].bg
  }
}

// Format date
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleString('zh-CN')
  } catch {
    return v
  }
}

// Format percentage
export function fmtPercent(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${value.toFixed(1)}%`
}

// Format price
export function fmtPrice(value: string | number | null | undefined): string {
  if (value == null) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return `¥${num.toFixed(4)}`
}

// Format API key prefix
export function fmtApiKeyPrefix(prefix: string | null): string {
  if (!prefix) return '-'
  return `${prefix}...`
}

// Format call statistics
export function fmtCalls(total: number, success: number): string {
  if (total === 0) return '0/0 (0%)'
  const rate = (success / total) * 100
  return `${success}/${total} (${rate.toFixed(1)}%)`
}

// Format weight with priority
export function fmtWeight(weight: number, priority: number): string {
  let result = `权重: ${weight}`
  if (priority !== 0) {
    result += `, 优先级: ${priority}`
  }
  return result
}

// Status labels
export const statusLabels = {
  active: '正常',
  down: '故障',
  disabled: '禁用',
  deleted: '已删除'
} as const

export const statusColors = {
  active: { text: 'text-green-700', bg: 'bg-green-100' },
  down: { text: 'text-red-700', bg: 'bg-red-100' },
  disabled: { text: 'text-yellow-700', bg: 'bg-yellow-100' },
  deleted: { text: 'text-slate-500', bg: 'bg-slate-200' }
} as const

// Strategy labels
export const strategyLabels = {
  round_robin: '轮询',
  weight_round_robin: '加权轮询',
  least_connections: '最少连接',
  least_response_time: '最快响应'
} as const

// Vendor type labels
export const vendorTypeLabels = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  azure: 'Azure',
  alibaba: '阿里云',
  tencent: '腾讯云',
  baidu: '百度',
  deepseek: '深度求索',
  zhipu: '智谱AI',
  moonshot: '月之暗面',
  stepfun: '阶跃星辰',
  other: '其他'
} as const

// Get status label
export function getStatusLabel(status: boolean, isDown: boolean, deletedAt: string | null): string {
  if (deletedAt) return statusLabels.deleted
  if (isDown) return statusLabels.down
  return status ? statusLabels.active : statusLabels.disabled
}

// Get status colors
export function getStatusColors(status: boolean, isDown: boolean, deletedAt: string | null) {
  if (deletedAt) return statusColors.deleted
  if (isDown) return statusColors.down
  return status ? statusColors.active : statusColors.disabled
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttle utility
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// Safe parse JSON
export function safeParseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

// Generate unique ID
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}