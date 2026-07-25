// Finance Commissions Utils

import type { CommissionRollupRow } from '@/types'

export function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.join(','), ...rows.map(r => r.join(','))]
  return lines.join('\n')
}

export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
