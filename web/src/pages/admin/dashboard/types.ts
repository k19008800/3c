/* ── Shared Types for Admin Dashboard components ── */

export interface DaySeries {
  date: string
  calls: {
    total: number
    success: number
    failed: number
    timeout: number
    successRate: number
    totalTokens: number
    totalCost: string
    avgDuration: number
  }
  newUsers: number
  revenue: { count: number; total: string }
}

export function fmtMoney(v: string | number, decimals = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
