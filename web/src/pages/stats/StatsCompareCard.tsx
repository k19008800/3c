import { useState, useEffect } from 'react'
import { get } from '@/lib/api'
import { BarChart3, Loader2, TrendingUp, TrendingDown } from 'lucide-react'

// ── Types ──

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

interface CompareData {
  mode: string
  days: number
  currentPeriod: { start: string; end: string; stats: PeriodStats }
  previousPeriod: { start: string; end: string; stats: PeriodStats }
  changes: Changes
}

// ── Helpers ──

function fmtCost(n: number): string {
  if (n >= 1000) return `¥${(n / 1000).toFixed(2)}k`
  return `¥${n.toFixed(4)}`
}

function fmtChange(pct: string): { text: string; cls: string; up: boolean | null } {
  if (pct === '0%') return { text: '持平', cls: 'text-slate-500', up: null }
  const n = parseFloat(pct)
  if (isNaN(n)) return pct === '+∞' ? { text: '+∞ ↗', cls: 'text-green-600', up: true } : { text: pct, cls: 'text-slate-500', up: null }
  if (n > 0) return { text: `+${n.toFixed(1)}%`, cls: 'text-red-600', up: false }
  return { text: `${n.toFixed(1)}%`, cls: 'text-green-600', up: true }
}

// ── Component ──

export default function StatsCompareCard() {
  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [mode, setMode] = useState<'previous' | 'yoy'>('previous')

  useEffect(() => {
    setLoading(true)
    get<{ data: CompareData }>(`/api/v1/me/stats/compare?days=${days}&mode=${mode}`)
      .then((res) => { if (res?.data) setData(res.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days, mode])

  const metrics = data ? [
    { label: '调用次数', current: data.currentPeriod.stats.calls.toLocaleString(), previous: data.previousPeriod.stats.calls.toLocaleString(), change: data.changes.calls },
    { label: 'Token 消耗', current: (data.currentPeriod.stats.tokens / 10000).toFixed(1) + '万', previous: (data.previousPeriod.stats.tokens / 10000).toFixed(1) + '万', change: data.changes.tokens },
    { label: '消费金额', current: fmtCost(data.currentPeriod.stats.cost), previous: fmtCost(data.previousPeriod.stats.cost), change: data.changes.cost },
    { label: '成功率', current: data.currentPeriod.stats.successRate.toFixed(1) + '%', previous: data.previousPeriod.stats.successRate.toFixed(1) + '%', change: data.changes.successRate },
    { label: '平均耗时', current: data.currentPeriod.stats.avgDurationMs.toFixed(0) + 'ms', previous: data.previousPeriod.stats.avgDurationMs.toFixed(0) + 'ms', change: data.changes.avgDurationMs },
  ] : []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-600" />
          历史对比
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-2 py-1 border rounded text-xs bg-white"
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'previous' | 'yoy')}
            className="px-2 py-1 border rounded text-xs bg-white"
          >
            <option value="previous">环比（上期）</option>
            <option value="yoy">同比（去年同期）</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 text-slate-500 font-medium">指标</th>
                <th className="text-right py-2 text-slate-500 font-medium px-3">
                  {mode === 'previous' ? '本期' : '今年'}
                </th>
                <th className="text-right py-2 text-slate-500 font-medium px-3">
                  {mode === 'previous' ? '上期' : '去年同期'}
                </th>
                <th className="text-right py-2 text-slate-500 font-medium">变化</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {metrics.map((m) => {
                const change = fmtChange(m.change)
                return (
                  <tr key={m.label} className="hover:bg-slate-50/50">
                    <td className="py-2.5 text-slate-700">{m.label}</td>
                    <td className="py-2.5 text-right font-mono text-slate-900 px-3">{m.current}</td>
                    <td className="py-2.5 text-right font-mono text-slate-500 px-3">{m.previous}</td>
                    <td className="py-2.5 text-right">
                      <span className={`inline-flex items-center gap-1 font-mono text-xs ${change.cls}`}>
                        {change.up === true && <TrendingUp size={12} />}
                        {change.up === false && <TrendingDown size={12} />}
                        {change.text}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center py-6 text-sm text-slate-400">暂无对比数据</p>
      )}
    </div>
  )
}
