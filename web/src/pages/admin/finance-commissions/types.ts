// ── Finance Commissions Types ──

import type { CommissionRecord, CommissionRollupRow } from '@/types'

export interface CommissionFilters {
  page: number
  pageSize: number
  agentId?: string
  startDate?: string
  endDate?: string
  status?: string
  commissionType?: string
}

export interface CommissionStats {
  totalCommission: number
  settledCommission: number
  pendingCommission: number
  totalRecords: number
}

// ── Helpers ──

export const fmt = (v: any) => `¥${parseFloat(String(v ?? 0)).toFixed(2)}`

export const toCSV = (headers: string[], rows: string[][]) => {
  const bom = '\uFEFF'
  const enc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const h = headers.map(enc).join(',')
  const body = rows.map(r => r.map(enc).join(',')).join('\n')
  return bom + [h, body].join('\n')
}

export const triggerDownload = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}