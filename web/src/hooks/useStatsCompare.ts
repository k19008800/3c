import { useState, useEffect } from 'react'
import { get } from '@/lib/api'

interface PeriodStats {
  calls: number
  tokens: number
  cost: number
  successCount: number
  failedCount: number
  avgDurationMs: number
  successRate: number
}

interface Changes {
  calls: string
  tokens: string
  cost: string
  successRate: string
  avgDurationMs: string
}

interface CompareResult {
  mode: 'previous' | 'yoy'
  days: number
  currentPeriod: { start: string; end: string; stats: PeriodStats }
  previousPeriod: { start: string; end: string; stats: PeriodStats }
  changes: Changes
}

export function useStatsCompare(days: number = 7, mode: 'previous' | 'yoy' = 'previous') {
  const [data, setData] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await get<{ data: CompareResult }>(
        `/api/v1/me/stats/compare?days=${days}&mode=${mode}`
      )
      if (res?.data) setData(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [days, mode])

  return { data, loading, reload: load }
}

// 格式化对比值
export function formatChange(pct: string): { text: string; color: string; icon: string } {
  if (pct === '0%') return { text: '持平', color: 'text-slate-500', icon: '—' }
  const num = parseFloat(pct)
  if (isNaN(num)) {
    if (pct === '+∞') return { text: '大幅增长', color: 'text-green-600', icon: '↑' }
    return { text: pct, color: 'text-slate-500', icon: '→' }
  }
  if (num > 0) return { text: pct, color: 'text-green-600', icon: '↑' }
  return { text: pct, color: 'text-red-600', icon: '↓' }
}

export function formatCost(n: number): string {
  if (n >= 1000) return `¥${(n / 1000).toFixed(2)}k`
  return `¥${n.toFixed(4)}`
}
