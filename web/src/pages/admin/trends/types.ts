/* ═══════════════════════════════════════════════════
   Shared Types & Helpers
   ═══════════════════════════════════════════════════ */

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
  revenue: {
    count: number
    total: string
  }
}

export interface TrendsData {
  days: number
  series: DaySeries[]
}

export interface HourEntry {
  hour: number
  total: number
  success: number
  failed: number
  timedout: number
  totalTokens: number
  totalCost: string
}

export interface HourlyData {
  date: string
  total: number
  hours: HourEntry[]
  topModels: { modelName: string; total: number; totalTokens: number }[]
  peakHour: {
    hour: number
    total: number
    topModels: { modelName: string; total: number }[]
  }
}

/* ── Formatting helpers ── */

export function fmtMoney(v: string | number, decimals = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toFixed(decimals)
}

export function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
}

export function shortDate(iso: string): string {
  return iso.slice(5) // "2026-06-28" -> "06-28"
}

export function dayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00+08:00')
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[d.getDay()]
}

export function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    let sum = 0
    for (let j = 0; j < window; j++) sum += values[i - j]
    return sum / window
  })
}

export function calcStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const sqDiffs = values.map((v) => (v - mean) ** 2)
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length)
}

export function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`
}

export function calcChange(current: number, previous?: number): { text: string; up: boolean } | null {
  if (previous === undefined || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  return { text: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', up: pct >= 0 }
}
