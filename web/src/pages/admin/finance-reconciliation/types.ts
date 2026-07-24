// ── Finance Reconciliation Types ──

import type { ReconciliationReport, ReconTrendPoint, ReconBalanceCheck } from '@/types'

export type { ReconciliationReport, ReconTrendPoint, ReconBalanceCheck }

// ── Helpers ──

export function fmt(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return n < 0 ? `-¥${Math.abs(n).toFixed(digits)}` : `¥${n.toFixed(digits)}`
}

export function fmtCompact(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  if (n >= 10000) return `¥${(n / 10000).toFixed(2)}万`
  return fmt(v)
}

export function fmtDate(d: string): string {
  if (d.includes('~')) return d
  return d
}