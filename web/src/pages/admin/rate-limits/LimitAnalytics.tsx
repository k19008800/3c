import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'

// ── 模拟趋势数据（生产环境中替换为实际 API 数据） ──

function generateMockTrend(days: number): number[] {
  return Array.from({ length: days }, () => Math.floor(Math.random() * 100) + 10)
}

// ── Props ──

interface LimitAnalyticsProps {
  /** 可选的实际趋势数据，若不传则使用模拟数据 */
  trendData?: {
    rpm: number[]
    tpm: number[]
    labels: string[]
  }
}

// ── MiniBarChart ──

function MiniBarChart({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const max = useMemo(() => Math.max(...data, 1), [data])
  const barWidth = Math.max(4, Math.floor(200 / data.length) - 2)

  return (
    <div className="flex items-end gap-[2px] h-full">
      {data.map((v, i) => {
        const pct = (v / max) * 100
        return (
          <div
            key={i}
            className="rounded-t transition-all duration-300"
            style={{
              width: `${barWidth}px`,
              height: `${pct}%`,
              backgroundColor: color,
              opacity: 0.6 + (v / max) * 0.4,
            }}
          />
        )
      })}
    </div>
  )
}

// ── 趋势卡片 ──

function TrendCard({
  title,
  data,
  color,
  unit,
}: {
  title: string
  data: number[]
  color: string
  unit: string
}) {
  const current = data[data.length - 1] ?? 0
  const prev = data.length > 1 ? data[data.length - 2] : current
  const change = prev > 0 ? ((current - prev) / prev) * 100 : 0
  const changeColor = change >= 0 ? 'text-red-500' : 'text-green-500'
  const changeIcon = change >= 0 ? '↑' : '↓'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{current.toLocaleString()} <span className="text-sm font-normal text-slate-400">{unit}</span></div>
          <div className={`text-xs mt-0.5 ${changeColor}`}>{changeIcon} {Math.abs(change).toFixed(1)}%</div>
        </div>
        <TrendingUp size={18} className="text-slate-300" />
      </div>
      <div className="h-8">
        <MiniBarChart data={data} color={color} />
      </div>
    </div>
  )
}

// ── 分析表 ──

function AnalyticsTable({ data, labels }: { data: number[]; labels: string[] }) {
  const rows = useMemo(() => {
    return data.map((v, i) => ({
      label: labels[i] || `第${i + 1}天`,
      value: v,
      pct: Math.max(...data, 1) > 0 ? (v / Math.max(...data, 1)) * 100 : 0,
    }))
  }, [data, labels])

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-600">每日限流趋势明细</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-2 text-xs font-medium text-slate-500">指标</th>
              {labels.map((l, i) => (
                <th key={i} className="px-4 py-2 text-xs font-medium text-slate-500">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2 text-xs text-slate-600 font-medium">限流次数</td>
              {rows.map((r, i) => (
                <td key={i} className="px-4 py-2 text-sm text-slate-800">{r.value}</td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-2 text-xs text-slate-600 font-medium">占比</td>
              {rows.map((r, i) => (
                <td key={i} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-slate-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{r.pct.toFixed(0)}%</span>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 空状态 ──

function EmptyState() {
  return (
    <div className="text-center py-16 text-slate-400">
      <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
      <div className="text-sm font-medium">暂无分析数据</div>
      <div className="text-xs mt-1">等待更多限流事件产生后将展示趋势分析</div>
    </div>
  )
}

// ── 主组件 ──

export default function LimitAnalytics({ trendData }: LimitAnalyticsProps) {
  const [analyticsRange, setAnalyticsRange] = useState<'7d' | '14d' | '30d'>('7d')

  const days = useMemo(() => {
    switch (analyticsRange) {
      case '7d': return 7
      case '14d': return 14
      case '30d': return 30
    }
  }, [analyticsRange])

  const rpmTrend = useMemo(() => trendData?.rpm ?? generateMockTrend(days), [trendData, days])
  const tpmTrend = useMemo(() => trendData?.tpm ?? generateMockTrend(days), [trendData, days])
  const labels = useMemo(() => {
    const now = new Date()
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (days - 1 - i))
      return `${d.getMonth() + 1}/${d.getDate()}`
    })
  }, [days])

  const hasData = rpmTrend.some((v) => v > 0) || tpmTrend.some((v) => v > 0)

  const rangeButtons = useMemo(
    () => [
      { value: '7d', label: '近 7 天' },
      { value: '14d', label: '近 14 天' },
      { value: '30d', label: '近 30 天' },
    ] as const,
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-500" />
          限流分析
        </h2>
        <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
          {rangeButtons.map((r) => (
            <button
              key={r.value}
              onClick={() => setAnalyticsRange(r.value)}
              className={`px-3 py-1.5 text-sm transition ${analyticsRange === r.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrendCard title="RPM 限流趋势" data={rpmTrend} color="#ef4444" unit="次/分" />
            <TrendCard title="TPM 限流趋势" data={tpmTrend} color="#f59e0b" unit="Token/分" />
          </div>

          <AnalyticsTable data={rpmTrend} labels={labels} />
        </>
      )}
    </div>
  )
}
