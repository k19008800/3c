// ── Shared constants & helpers for commission pages ──

import type { ComponentType } from 'react'
import { CheckCircle2 } from 'lucide-react'

export const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  settled: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}
export const STATUS_LABEL: Record<string, string> = {
  pending: '待结算',
  settled: '已结算',
  cancelled: '已取消',
}

export const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'sale', label: '销售佣金' },
  { value: 'team', label: '团队佣金' },
  { value: 'activity', label: '活动奖励' },
  { value: 'renewal', label: '续费佣金' },
]

export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待结算' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
]

export function fmt4(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return n.toFixed(4)
}

export function fmt2(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return n.toFixed(2)
}

export interface SummaryCardItem {
  label: string
  value: string
  sub?: string
  icon: ComponentType<{ size?: number; className?: string }>
  color: string
  bg: string
}

export interface CommissionListFilters {
  statusFilter: string
  typeFilter: string
  startDate: string
  endDate: string
  customerSearch: string
}

export function statusIcon(status: string) {
  return status === 'settled' ? CheckCircle2 : undefined
}
