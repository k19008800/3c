import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { Loader2, AlertTriangle, TrendingUp, DollarSign, Users, PhoneCall, RefreshCw, ChevronUp, Clock, BarChart3, Zap } from 'lucide-react'

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

interface DaySeries {
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

interface TrendsData {
  days: number
  series: DaySeries[]
}

interface HourEntry {
  hour: number
  total: number
  success: number
  failed: number
  timedout: number
  totalTokens: number
  totalCost: string
}

interface HourlyData {
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

/* ═══════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════ */

function fmtMoney(v: string | number, decimals = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toFixed(decimals)
}

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
}

function shortDate(iso: string): string {
  return iso.slice(5) // "2026-06-28" → "06-28"
}

function dayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00+08:00')
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[d.getDay()]
}

function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    let sum = 0
    for (let j = 0; j < window; j++) sum += values[i - j]
    return sum / window
  })
}

function calcStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const sqDiffs = values.map((v) => (v - mean) ** 2)
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length)
}

function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`
}

/* ═══════════════════════════════════════════════════
   Reusable Chart Component
   ═══════════════════════════════════════════════════ */

interface ChartProps {
  data: { label: string; value: number }[]
  title: string
  unit: string
  barColor: string
  barGradientFrom: string
  barGradientTo: string
  peakColor: string
  formatValue: (v: number) => string
  onBarClick?: (index: number, label: string) => void
}

function TrendChart({
  data,
  title,
  unit,
  barColor,
  barGradientFrom,
  barGradientTo,
  peakColor,
  formatValue,
  onBarClick,
}: ChartProps) {
  if (data.length === 0) return null

  const values = data.map((d) => d.value)
  const max = Math.max(...values, 1)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const peakIndex = values.indexOf(max)
  const secondPeak = Math.max(...values.filter((v) => v < max), 0)
  const secondPeakIndex = values.indexOf(secondPeak)

  // Bars that are >=85% of peak get the "highlight" treatment
  const highlightThreshold = max * 0.85

  // Moving average window: 3 for short data, 5 for longer
  const maWindow = data.length >= 20 ? 5 : data.length >= 10 ? 3 : 0
  const maValues = maWindow > 0 ? movingAverage(values, maWindow) : []

  // SVG dimensions
  const PADDING_TOP = 28
  const PADDING_BOTTOM = 22
  const CHART_HEIGHT = 180
  const TOTAL_HEIGHT = CHART_HEIGHT
  const Y_RANGE = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM // 130

  // If all values are 0, show a flat line
  const effectiveMax = Math.max(max, 1)

  const toY = (v: number) => CHART_HEIGHT - PADDING_BOTTOM - (v / effectiveMax) * Y_RANGE

  const n = data.length
  const barAreaWidth = 100
  const barGap = Math.max(1.5, Math.min(4, barAreaWidth / n / 4))
  const barWidth = Math.max(3, Math.min(20, (barAreaWidth - barGap * (n + 1)) / n))

  // MA line points (skip nulls)
  const maPoints: string[] = []
  maValues.forEach((v, i) => {
    if (v === null) return
    const x = barGap + i * (barWidth + barGap) + barWidth / 2
    maPoints.push(`${x},${toY(v)}`)
  })

  // X labels: skip some when too many
  const xLabelInterval = n <= 10 ? 1 : n <= 20 ? 2 : 3

  // Peak annotation Y offset
  const peakY = toY(max)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span>日均 {formatValue(avg)}</span>
          <span>峰值 {formatValue(max)}</span>
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${barAreaWidth} ${CHART_HEIGHT}`}
        className="w-full cursor-pointer"
        preserveAspectRatio="none"
        style={{ height: 140 }}
      >
        <defs>
          <linearGradient id={`bg-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barGradientFrom} stopOpacity="0.85" />
            <stop offset="100%" stopColor={barGradientTo} stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={`pg-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={peakColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={peakColor} stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={`ag-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barGradientFrom} stopOpacity="0.15" />
            <stop offset="100%" stopColor={barGradientFrom} stopOpacity="0.02" />
          </linearGradient>
          <filter id={`sh-${title}`}>
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={barGradientFrom} floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Y grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = CHART_HEIGHT - PADDING_BOTTOM - frac * Y_RANGE
          return (
            <line key={frac} x1={barGap} y1={y} x2={barAreaWidth - barGap} y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
          )
        })}

        {/* Area fill under MA line */}
        {maPoints.length > 1 && (
          <polygon
            points={
              maPoints.join(' ') +
              ` ${maPoints[maPoints.length - 1].split(',')[0]},${CHART_HEIGHT - PADDING_BOTTOM}` +
              ` ${maPoints[0].split(',')[0]},${CHART_HEIGHT - PADDING_BOTTOM}`
            }
            fill={`url(#ag-${title})`}
          />
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const h = Math.max(1, (d.value / effectiveMax) * Y_RANGE)
          const x = barGap + i * (barWidth + barGap)
          const y = CHART_HEIGHT - PADDING_BOTTOM - h
          const isPeak = i === peakIndex
          const isHighlight = d.value >= highlightThreshold

          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={1.5}
                className="transition-opacity duration-200 hover:opacity-80"
                fill={isPeak ? `url(#pg-${title})` : `url(#bg-${title})`}
                filter={isHighlight ? `url(#sh-${title})` : undefined}
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(i, d.label)}
              />
              {/* Invisible wider hit target */}
              <rect
                x={x - barGap / 2}
                y={0}
                width={barWidth + barGap}
                height={CHART_HEIGHT}
                fill="transparent"
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(i, d.label)}
              />
              {/* Native tooltip */}
              <title>
                {d.label} ({dayOfWeek(d.label)})
                {'\n'}{formatValue(d.value)}{' '}{unit}
                {isPeak ? '\n🏆 峰值' : ''}
              </title>
            </g>
          )
        })}

        {/* Moving average line */}
        {maPoints.length > 1 && (
          <polyline
            points={maPoints.join(' ')}
            fill="none"
            stroke={barGradientFrom}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
        )}

        {/* Peak annotation */}
        {peakY > PADDING_TOP && (
          <g>
            <text
              x={barGap + peakIndex * (barWidth + barGap) + barWidth / 2}
              y={peakY - 6}
              textAnchor="middle"
              fontSize="6"
              fontWeight="bold"
              fill={peakColor}
            >
              🔺
            </text>
            <text
              x={barGap + peakIndex * (barWidth + barGap) + barWidth / 2}
              y={peakY - 14}
              textAnchor="middle"
              fontSize="5"
              fill={peakColor}
              fontWeight="bold"
            >
              {formatValue(max)}
            </text>
            <text
              x={barGap + peakIndex * (barWidth + barGap) + barWidth / 2}
              y={CHART_HEIGHT - PADDING_BOTTOM + 12}
              textAnchor="middle"
              fontSize="5"
              fill={peakColor}
            >
              {shortDate(data[peakIndex].label)}
            </text>
          </g>
        )}

        {/* Second peak annotation */}
        {secondPeakIndex !== -1 && secondPeakIndex !== peakIndex && (secondPeak / max) > 0.85 && (
          <g>
            <text
              x={barGap + secondPeakIndex * (barWidth + barGap) + barWidth / 2}
              y={toY(secondPeak) - 6}
              textAnchor="middle"
              fontSize="5"
              fill="#f97316"
              fontWeight="bold"
            >
              {formatValue(secondPeak)}
            </text>
          </g>
        )}

        {/* X labels */}
        {data
          .filter((_, i) => i % xLabelInterval === 0 || i === n - 1)
          .map((d, _, filtered) => {
            const idx = data.indexOf(d)
            const x = barGap + idx * (barWidth + barGap) + barWidth / 2
            const isLast = idx === n - 1
            return (
              <text
                key={d.label}
                x={x}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fontSize="6"
                fill={isLast ? '#6366f1' : '#94a3b8'}
                fontWeight={isLast ? 'bold' : 'normal'}
              >
                {shortDate(d.label)}
              </text>
            )
          })}
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Hourly Drilldown Component
   ═══════════════════════════════════════════════════ */

function HourlyDrilldown({
  date,
  data,
  onClose,
}: {
  date: string
  data: HourlyData
  onClose: () => void
}) {
  const maxHour = Math.max(...data.hours.map((h) => h.total), 1)
  const peakHour = data.peakHour

  return (
    <div className="bg-white rounded-xl shadow-sm border border-indigo-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="px-4 py-3 border-b border-indigo-100 flex items-center justify-between bg-indigo-50">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-indigo-600" />
          <h3 className="text-sm font-semibold text-indigo-800">
            {date} ({dayOfWeek(date)}) · 时段分布
          </h3>
          <span className="text-[11px] text-indigo-500">
            全天 {data.total.toLocaleString()} 次调用
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-indigo-400 hover:text-indigo-600 transition rounded hover:bg-indigo-100"
        >
          <ChevronUp size={18} />
        </button>
      </div>

      <div className="p-4">
        {/* Hourly bar chart */}
        <svg viewBox="0 0 720 100" className="w-full" style={{ height: 64 }}>
          <defs>
            <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {data.hours.map((h, i) => {
            const bw = 26
            const gap = 4
            const x = i * (bw + gap)
            const hgt = Math.max(1, (h.total / maxHour) * 68)
            const y = 72 - hgt
            const isPeak = h.hour === peakHour.hour
            return (
              <g key={h.hour}>
                <rect
                  x={x}
                  y={y}
                  width={bw}
                  height={hgt}
                  rx={2}
                  fill={isPeak ? '#ef4444' : 'url(#hourGrad)'}
                  opacity={isPeak ? 0.9 : h.total === 0 ? 0.3 : 0.7}
                >
                  <title>{formatHour(h.hour)}: {h.total.toLocaleString()} 次</title>
                </rect>
                {isPeak && (
                  <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="7" fill="#dc2626" fontWeight="bold">
                    🔺 {h.total.toLocaleString()}
                  </text>
                )}
              </g>
            )
          })}
          {/* Hour labels (every 3) */}
          {data.hours
            .filter((h) => h.hour % 3 === 0)
            .map((h) => (
              <text
                key={h.hour}
                x={h.hour * 30 + 13}
                y={86}
                textAnchor="middle"
                fontSize="6"
                fill="#94a3b8"
              >
                {formatHour(h.hour)}
              </text>
            ))}
        </svg>

        {/* Peak detail */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-[11px] font-medium">
            <Zap size={12} />
            峰值时段 {formatHour(peakHour.hour)} · {peakHour.total.toLocaleString()} 次
          </span>
          {peakHour.topModels.map((m, i) => (
            <span
              key={m.modelName}
              className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] ${
                i === 0
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'bg-slate-50 text-slate-600'
              }`}
            >
              #{i + 1} {m.modelName} ({m.total.toLocaleString()}次)
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */

export default function TrendsCharts() {
  const [data, setData] = useState<TrendsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(7)

  // Hourly drilldown state
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)
  const [hourlyData, setHourlyData] = useState<HourlyData | null>(null)
  const [hourlyLoading, setHourlyLoading] = useState(false)

  const fetchTrends = useCallback(async (d: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await get<TrendsData>(`/api/v1/admin/dashboard/trends?days=${d}`)
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取趋势数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrends(days)
  }, [fetchTrends, days])

  // Reset drilldown when days change
  useEffect(() => {
    setDrilldownDate(null)
    setHourlyData(null)
  }, [days])

  const handleBarClick = useCallback(async (index: number, label: string) => {
    if (drilldownDate === label) {
      // Toggle off
      setDrilldownDate(null)
      setHourlyData(null)
      return
    }
    setDrilldownDate(label)
    setHourlyLoading(true)
    try {
      const res = await get<HourlyData>(`/api/v1/admin/dashboard/trends/hourly?date=${label}`)
      setHourlyData(res)
    } catch {
      setHourlyData(null)
    } finally {
      setHourlyLoading(false)
    }
  }, [drilldownDate])

  /* ── Loading / Error ── */
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertTriangle size={16} />
        {error}
        <button onClick={() => fetchTrends(days)} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">
          重试
        </button>
      </div>
    )
  }

  const { series } = data!

  /* ── Chart data ── */
  const callChartData = series.map((s) => ({ label: s.date, value: s.calls.total }))
  const revenueChartData = series.map((s) => ({ label: s.date, value: parseFloat(s.revenue.total) }))
  const userChartData = series.map((s) => ({ label: s.date, value: s.newUsers }))

  /* ── Summary cards (latest day) ── */
  const latest = series[series.length - 1]
  const prev = series.length > 1 ? series[series.length - 2] : undefined

  const change = (current: number, previous?: number): { text: string; up: boolean } | null => {
    if (previous === undefined || previous === 0) return null
    const pct = ((current - previous) / previous) * 100
    return { text: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', up: pct >= 0 }
  }

  const callDelta = latest ? change(latest.calls.total, prev?.calls.total) : null
  const revenueDelta = latest ? change(parseFloat(latest.revenue.total), prev ? parseFloat(prev.revenue.total) : undefined) : null
  const userDelta = latest ? change(latest.newUsers, prev?.newUsers) : null

  const summaryCards = [
    {
      label: '今日调用',
      value: latest?.calls.total.toLocaleString() || '0',
      sub: `成功率 ${latest?.calls.successRate ?? 100}%`,
      icon: PhoneCall,
      color: 'text-violet-600 bg-violet-50',
      delta: callDelta,
    },
    {
      label: '今日 Token',
      value: fmtNum(latest?.calls.totalTokens ?? 0),
      sub: `¥${fmtMoney(latest?.calls.totalCost ?? '0')}`,
      icon: TrendingUp,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '今日收入',
      value: `¥${fmtMoney(latest?.revenue.total ?? '0')}`,
      sub: `${latest?.revenue.count ?? 0} 笔充值`,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50',
      delta: revenueDelta,
    },
    {
      label: '今日新增用户',
      value: `${latest?.newUsers ?? 0}`,
      sub: `累计 ${series.reduce((a, s) => a + s.newUsers, 0)}`,
      icon: Users,
      color: 'text-amber-600 bg-amber-50',
      delta: userDelta,
    },
  ]

  /* ── Peak analysis ── */
  const callValues = callChartData.map((d) => d.value)
  const callAvg = callValues.reduce((a, b) => a + b, 0) / callValues.length
  const callMax = Math.max(...callValues)
  const callMin = Math.min(...callValues)
  const callStdDev = calcStdDev(callValues, callAvg)
  const callCV = callAvg > 0 ? (callStdDev / callAvg) * 100 : 0
  const maxIdx = callValues.indexOf(callMax)
  const minIdx = callValues.indexOf(callMin)

  const peakCards = [
    {
      icon: '🏆',
      label: '最高日调用量',
      value: fmtNum(callMax),
      sub: `${callChartData[maxIdx]?.label ?? ''} ${dayOfWeek(callChartData[maxIdx]?.label ?? '')} · 超日均 ${callAvg > 0 ? `+${((callMax / callAvg - 1) * 100).toFixed(0)}%` : '-'}`,
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      labelColor: 'text-purple-700',
      valColor: 'text-purple-900',
      subColor: 'text-purple-400',
    },
    {
      icon: '📊',
      label: '日均调用量',
      value: fmtNum(Math.round(callAvg)),
      sub: `±${fmtNum(Math.round(callStdDev))} 标准差`,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      labelColor: 'text-amber-700',
      valColor: 'text-amber-900',
      subColor: 'text-amber-400',
    },
    {
      icon: '⬇️',
      label: '最低日调用量',
      value: fmtNum(callMin),
      sub: `${callChartData[minIdx]?.label ?? ''} ${dayOfWeek(callChartData[minIdx]?.label ?? '')}`,
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      labelColor: 'text-blue-700',
      valColor: 'text-blue-900',
      subColor: 'text-blue-400',
    },
    {
      icon: '📈',
      label: '波动系数',
      value: `${callCV.toFixed(1)}%`,
      sub: callCV > 30 ? 'CV=σ/μ · 高波动⚠️' : callCV > 15 ? 'CV=σ/μ · 中等波动' : 'CV=σ/μ · 稳定',
      bg: callCV > 30 ? 'bg-red-50' : 'bg-green-50',
      border: callCV > 30 ? 'border-red-200' : 'border-green-200',
      labelColor: callCV > 30 ? 'text-red-700' : 'text-green-700',
      valColor: callCV > 30 ? 'text-red-900' : 'text-green-900',
      subColor: callCV > 30 ? 'text-red-400' : 'text-green-400',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Header + days toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">趋势</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-md transition ${
                  days === d ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchTrends(days)}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
            title="刷新"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-xs text-slate-500">{card.label}</p>
              <div className={`p-1.5 rounded-lg ${card.color}`}>
                <card.icon size={14} />
              </div>
            </div>
            <p className={`text-xl font-bold ${card.delta ? (card.delta.up ? 'text-slate-900' : 'text-red-700') : 'text-slate-900'}`}>
              {card.value}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{card.sub}</p>
            {card.delta && (
              <p className={`text-[11px] mt-1 font-medium ${card.delta.up ? 'text-green-600' : 'text-red-600'}`}>
                {card.delta.up ? '↑' : '↓'} {card.delta.text}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }} />
          每日调用量
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: '#7c3aed' }} />
          移动平均线
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-red-500">🔺</span>
          峰值标注
        </span>
        <span className="flex items-center gap-1.5 text-indigo-500">
          <BarChart3 size={12} />
          点击柱状展开时段
        </span>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendChart
          data={callChartData}
          title="调用量趋势"
          unit="次"
          barColor="violet"
          barGradientFrom="#8b5cf6"
          barGradientTo="#a78bfa"
          peakColor="#ef4444"
          formatValue={(v) => fmtNum(v)}
          onBarClick={handleBarClick}
        />
        <TrendChart
          data={revenueChartData}
          title="收入趋势"
          unit="元"
          barColor="emerald"
          barGradientFrom="#10b981"
          barGradientTo="#6ee7b7"
          peakColor="#ef4444"
          formatValue={(v) => `¥${fmtMoney(v)}`}
        />
        <TrendChart
          data={userChartData}
          title="新增用户趋势"
          unit="人"
          barColor="amber"
          barGradientFrom="#f59e0b"
          barGradientTo="#fbbf24"
          peakColor="#ef4444"
          formatValue={(v) => v.toLocaleString()}
        />
      </div>

      {/* Peak Analysis Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {peakCards.map((card) => (
          <div key={card.label} className={`${card.bg} ${card.border} rounded-xl border p-4`}>
            <div className={card.labelColor} style={{ fontSize: 24, lineHeight: 1 }}>{card.icon}</div>
            <p className={`text-[11px] ${card.labelColor} mt-1`}>{card.label}</p>
            <p className={`text-lg font-bold ${card.valColor} mt-0.5`}>{card.value}</p>
            <p className={`text-[10px] ${card.subColor} mt-0.5`}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Hourly Drilldown */}
      {drilldownDate && (
        hourlyLoading ? (
          <div className="flex items-center justify-center py-6 bg-white rounded-xl border border-indigo-200">
            <Loader2 className="animate-spin text-indigo-400" size={20} />
          </div>
        ) : hourlyData ? (
          <HourlyDrilldown date={drilldownDate} data={hourlyData} onClose={() => { setDrilldownDate(null); setHourlyData(null) }} />
        ) : null
      )}

      {/* Detail Table */}
      {series.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">每日明细</h3>
            <span className="text-[10px] text-slate-400">提示: 点击上方柱状图查看时段分布</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-4 py-2.5 font-medium">日期</th>
                  <th className="px-4 py-2.5 font-medium text-right">调用</th>
                  <th className="px-4 py-2.5 font-medium text-right">成功率</th>
                  <th className="px-4 py-2.5 font-medium text-right">Token</th>
                  <th className="px-4 py-2.5 font-medium text-right">消费</th>
                  <th className="px-4 py-2.5 font-medium text-right">收入</th>
                  <th className="px-4 py-2.5 font-medium text-right">新增</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {series.map((s) => (
                  <tr
                    key={s.date}
                    className={`hover:bg-slate-50 transition ${
                      s.calls.total === callMax ? 'bg-red-50 font-medium' : ''
                    } ${drilldownDate === s.date ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-slate-700 font-mono">
                      {s.date}
                      {dayOfWeek(s.date) !== '周日' && dayOfWeek(s.date) !== '周六' ? (
                        <span className="ml-1 text-[10px] text-slate-400">{dayOfWeek(s.date)}</span>
                      ) : (
                        <span className="ml-1 text-[10px] text-red-400">{dayOfWeek(s.date)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-800 font-medium">
                      {s.calls.total.toLocaleString()}
                      {s.calls.total === callMax && <span className="ml-1">🏆</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-medium ${s.calls.successRate >= 99 ? 'text-green-600' : s.calls.successRate >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {s.calls.successRate}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtNum(s.calls.totalTokens)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">¥{fmtMoney(s.calls.totalCost)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">¥{fmtMoney(s.revenue.total)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{s.newUsers}</td>
                  </tr>
                ))}
                {/* Sum row */}
                <tr className="bg-slate-50 font-semibold text-slate-800">
                  <td className="px-4 py-2.5">合计</td>
                  <td className="px-4 py-2.5 text-right">
                    {series.reduce((a, s) => a + s.calls.total, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {(() => {
                      const t = series.reduce((a, s) => a + s.calls.total, 0)
                      const su = series.reduce((a, s) => a + s.calls.success, 0)
                      return t > 0 ? ((su / t) * 100).toFixed(1) + '%' : '-'
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {fmtNum(series.reduce((a, s) => a + s.calls.totalTokens, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    ¥{fmtMoney(series.reduce((a, s) => a + parseFloat(s.calls.totalCost), 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">
                    ¥{fmtMoney(series.reduce((a, s) => a + parseFloat(s.revenue.total), 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {series.reduce((a, s) => a + s.newUsers, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
