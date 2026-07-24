import type { KeyItem, HealthStatus } from './types'

/** 计算健康状态 */
export function calcHealth(item: KeyItem): HealthStatus {
  if (item.totalCalls < 10) return { level: 'warn', rate: null } // 数据不足
  const rate = item.totalCalls > 0 ? (item.successCalls / item.totalCalls) * 100 : 0
  if (rate >= 90 && item.consecutiveFailures < 3) return { level: 'healthy', rate }
  if (rate >= 70 && item.consecutiveFailures < 10) return { level: 'warn', rate }
  return { level: 'danger', rate }
}

/** 格式化价格 */
export function fmtPrice(val: string | number | null): string {
  if (val === null || val === '') return '—'
  const n = Number(val)
  if (n === 0) return '—'
  if (n < 0.0001) return '<0.0001'
  return n.toFixed(4)
}

/** 格式化日期 */
export function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 格式化百分比 */
export function fmtPercent(rate: number | null): string {
  if (rate === null) return '—'
  return rate.toFixed(1) + '%'
}

/** 格式化 API Key 前缀 */
export function fmtApiKeyPrefix(prefix: string | null): string {
  if (!prefix) return '—'
  return prefix
}

/** 格式化调用次数 */
export function fmtCalls(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

/** 格式化权重 */
export function fmtWeight(w: number): string {
  return String(w)
}

/** 获取状态标签 */
/** 获取状态标签（兼容多参数调用） */
export function getStatusLabel(status: boolean, isDown?: boolean, deletedAt?: string | null): string {
  if (deletedAt) return '已删除'
  if (isDown) return '故障'
  if (!status) return '禁用'
  return '活跃'
}

/** 获取状态标签（KeyItem 版本） */
export function getStatusLabelFromItem(item: KeyItem): string {
  return getStatusLabel(item.status, item.isDown, item.deletedAt)
}

/** 获取状态颜色（兼容多参数调用） */
export function getStatusColors(status: boolean, isDown?: boolean, deletedAt?: string | null): { bg: string; text: string } {
  if (deletedAt) return { bg: 'bg-slate-100', text: 'text-slate-600' }
  if (isDown) return { bg: 'bg-red-100', text: 'text-red-700' }
  if (!status) return { bg: 'bg-yellow-100', text: 'text-yellow-700' }
  return { bg: 'bg-green-100', text: 'text-green-700' }
}

/** 获取状态颜色（KeyItem 版本） */
export function getStatusColorsFromItem(item: KeyItem): { bg: string; text: string } {
  return getStatusColors(item.status, item.isDown, item.deletedAt)
}

/** 健康状态扩展信息 */
export interface HealthInfo {
  level: 'healthy' | 'warn' | 'danger'
  rate: number | null
  label: string
  color: string
  bgColor: string
}

/** 计算健康状态（扩展） */
export function calcHealthInfo(item: KeyItem): HealthInfo {
  const base = calcHealth(item)
  if (base.level === 'healthy') {
    return { ...base, label: '健康', color: 'text-green-600', bgColor: 'bg-green-100' }
  }
  if (base.level === 'warn') {
    return { ...base, label: '警告', color: 'text-yellow-600', bgColor: 'bg-yellow-100' }
  }
  return { ...base, label: '危险', color: 'text-red-600', bgColor: 'bg-red-100' }
}