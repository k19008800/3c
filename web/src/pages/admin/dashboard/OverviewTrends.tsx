// ============================================================
//  3cloud (3C) — 沉浸式总览趋势（借鉴宝塔监控UI设计哲学）
//  每个指标独立图表，拒绝多轴混排
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react'
import { get } from '@/lib/api'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot,
} from 'recharts'
import {
  TrendingUp, BarChart3, Activity, RefreshCw, Download,
  PhoneCall, DollarSign, Clock, CheckCircle, Zap,
  ChevronUp, X, Sun, CalendarDays,
  Calendar, CalendarRange, Loader2,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

interface DaySeries {
  date: string
  calls: {
    total: number; success: number; failed: number; timeout: number
    successRate: number; totalTokens: number; totalCost: string; avgDuration: number
  }
  newUsers: number
  revenue?: { count: number; total: string }
}

interface HourEntry {
  hour: number; total: number; success: number; failed: number
  timedout: number; totalTokens: number; totalCost: string
}

interface HourlyData {
  date: string; total: number; hours: HourEntry[]
  topModels: { modelName: string; total: number; totalTokens: number }[]
  peakHour: { hour: number; total: number; topModels: { modelName: string; total: number }[] }
}

interface CompareData {
  days: number; currentLabel: string; previousLabel: string
  merged: { date: string; current: DaySeries; previous: DaySeries | null; diff: { calls: number; callsPct: string | null } }[]
  summary: { currentTotal: number; previousTotal: number; currentTokens: number; previousTokens: number; currentCost: number; previousCost: number }
}

/* ═══════════════════════════════════════════════════
   Metrics Configuration
   ═══════════════════════════════════════════════════ */

type MetricKey = 'calls' | 'tokens' | 'cost' | 'revenue' | 'duration' | 'successRate'
type ChartStyle = 'line' | 'bar' | 'area'

interface MetricConfig {
  key: MetricKey
  label: string
  icon: any
  color: string
  gradientId: string
  unit: string
  format: (v: number) => string
  dataKey: string   // key in chart data record
  extraKeys?: { dataKey: string; name: string; color: string; dashed?: boolean }[]
  yAxisLabel?: string
}

const METRICS: MetricConfig[] = [
  { key: 'calls', label: '调用量', icon: PhoneCall, color: '#0984e3', gradientId: 'gradCalls',
    unit: '次', format: (v) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString(),
    dataKey: 'calls', yAxisLabel: '调用量' },
  { key: 'tokens', label: 'Token消耗', icon: Zap, color: '#6c5ce7', gradientId: 'gradTokens',
    unit: 'M', format: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString(),
    dataKey: 'tokens', yAxisLabel: 'Tokens' },
  { key: 'cost', label: '成本', icon: DollarSign, color: '#e17055', gradientId: 'gradCost',
    unit: '¥', format: (v) => `¥${v.toFixed(2)}`,
    dataKey: 'cost', yAxisLabel: '金额 (¥)' },
  { key: 'revenue', label: '营收', icon: TrendingUp, color: '#00b894', gradientId: 'gradRevenue',
    unit: '¥', format: (v) => `¥${v.toFixed(2)}`,
    dataKey: 'revenue', yAxisLabel: '金额 (¥)' },
  { key: 'duration', label: '平均耗时', icon: Clock, color: '#fd79a8', gradientId: 'gradDuration',
    unit: 'ms', format: (v) => `${v.toFixed(0)}ms`,
    dataKey: 'duration', yAxisLabel: '毫秒' },
  { key: 'successRate', label: '成功率', icon: CheckCircle, color: '#74b9ff', gradientId: 'gradSuccess',
    unit: '%', format: (v) => `${v.toFixed(1)}%`,
    dataKey: 'successRate', extraKeys: [{ dataKey: 'successRateTarget', name: '目标', color: '#e17055', dashed: true }],
    yAxisLabel: '%' },
]

const CHART_STYLES: { key: ChartStyle; label: string; icon: any }[] = [
  { key: 'line', label: '折线', icon: TrendingUp },
  { key: 'bar', label: '柱状', icon: BarChart3 },
  { key: 'area', label: '面积', icon: Activity },
]

const TIME_OPTIONS = [
  { value: 1, label: '今日', icon: Sun },
  { value: 7, label: '本周', icon: CalendarDays },
  { value: 30, label: '本月', icon: Calendar },
  { value: 90, label: '近三月', icon: CalendarRange },
  { value: 0, label: '自定义', icon: CalendarRange },
]

function shortDate(iso: string): string {
  return iso.slice(5)
}

function dayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00+08:00')
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
}

function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`
}

/* ═══════════════════════════════════════════════════
   Custom Tooltip (宝塔风格：时间+精确数值+环比)
   ═══════════════════════════════════════════════════ */

function BaotaTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  const main = payload[0]
  const prev = payload.length > 1 ? payload[1] : null
  const diff = prev && main?.value != null && prev.value != null
    ? ((main.value - prev.value) / prev.value * 100).toFixed(1)
    : null

  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-3.5 text-xs min-w-[180px]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className="text-slate-400 text-[10px]">{dayOfWeek(label)}</span>
      </div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3 py-1">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-800">
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
      {diff != null && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
          环比上期: <span className={parseFloat(diff) >= 0 ? 'text-red-500' : 'text-green-500'}>{diff}%</span>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */

interface Props {
  series: DaySeries[]
  days: number
  onDaysChange: (d: number) => void
  loading: boolean
  onRefresh?: () => void
}

export default function OverviewTrends({ series, days, onDaysChange, loading, onRefresh }: Props) {
  /* ── Internal state ── */
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('calls')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line')
  const [compareMode, setCompareMode] = useState(false)
  const [showStats, setShowStats] = useState(true)

  // Compare data
  const [compareData, setCompareData] = useState<CompareData | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)

  // Hourly drilldown
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)
  const [hourlyData, setHourlyData] = useState<HourlyData | null>(null)
  const [hourlyLoading, setHourlyLoading] = useState(false)

  // Custom date modal
  const [customOpen, setCustomOpen] = useState(false)
  const [customDays, setCustomDays] = useState('')

  // Current metric config
  const metricConfig = useMemo(() => METRICS.find((m) => m.key === selectedMetric)!, [selectedMetric])

  /* ── Build chart data ── */
  const chartData = useMemo(() => {
    return series.map((s) => ({
      date: s.date,
      label: shortDate(s.date),
      calls: s.calls.total,
      tokens: s.calls.totalTokens,
      cost: parseFloat(s.calls.totalCost),
      revenue: parseFloat((s as any).revenue?.total ?? '0'),
      duration: s.calls.avgDuration,
      successRate: s.calls.successRate,
      successRateTarget: 99.0,
      // Compare overlay
      prevCalls: compareData?.merged.find((m) => m.date === s.date)?.previous?.calls.total ?? null,
      prevTokens: compareData?.merged.find((m) => m.date === s.date)?.previous?.calls.totalTokens ?? null,
      prevCost: compareData?.merged.find((m) => m.date === s.date)?.previous?.calls.totalCost
        ? parseFloat(compareData.merged.find((m) => m.date === s.date)!.previous!.calls.totalCost) : null,
      prevRevenue: compareData?.merged.find((m) => m.date === s.date)?.previous?.revenue?.total
        ? parseFloat(compareData.merged.find((m) => m.date === s.date)!.previous!.revenue!.total) : null,
    }))
  }, [series, compareData])

  /* ── Fetch compare data when toggled ── */
  useEffect(() => {
    if (!compareMode || days <= 1 || series.length === 0) {
      setCompareData(null)
      return
    }
    setCompareLoading(true)
    const params: Record<string, string> = { days: String(days) }
    get<CompareData>('/api/v1/admin/dashboard/trends/compare', params)
      .then(setCompareData)
      .catch(() => setCompareData(null))
      .finally(() => setCompareLoading(false))
  }, [compareMode, days, series.length])

  /* ── Reset drilldown on days change ── */
  useEffect(() => {
    setDrilldownDate(null)
    setHourlyData(null)
  }, [days])

  /* ── Statistics summary ── */
  const summary = useMemo(() => {
    if (chartData.length === 0) return null

    const vals = chartData.map((d) => {
      switch (selectedMetric) {
        case 'calls': return d.calls
        case 'tokens': return d.tokens
        case 'cost': return d.cost
        case 'revenue': return d.revenue
        case 'duration': return d.duration
        case 'successRate': return d.successRate
      }
    })

    const total = vals.reduce((a, b) => a + b, 0)
    const mean = total / vals.length
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    const cv = mean > 0 ? (std / mean) * 100 : 0

    // Trend direction: linear regression
    const n = vals.length
    const xMean = (n - 1) / 2
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (vals[i] - mean)
      den += (i - xMean) ** 2
    }
    const slope = den > 0 ? num / den : 0
    const trendDir = slope > 0.3 ? 'up' as const : slope < -0.3 ? 'down' as const : 'stable' as const

    // Change vs first 7 days (or first half)
    const half = Math.max(1, Math.floor(n / 2))
    const first = vals.slice(0, half).reduce((a, b) => a + b, 0) / half
    const last = vals.slice(-half).reduce((a, b) => a + b, 0) / half
    const change = first > 0 ? ((last - first) / first) * 100 : 0

    return { total, mean, max, min, std, cv, slope, trendDir, change }
  }, [chartData, selectedMetric])

  /* ── Anomaly detection ── */
  const anomalies = useMemo(() => {
    if (chartData.length < 5) return []
    const vals = chartData.map((d) => {
      switch (selectedMetric) {
        case 'calls': return d.calls
        case 'tokens': return d.tokens
        case 'cost': return d.cost
        case 'revenue': return d.revenue
        case 'duration': return d.duration
        case 'successRate': return d.successRate
      }
    })
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    const threshold = std * 2

    return chartData
      .filter((d) => {
        const v = (d as any)[metricConfig.dataKey] as number
        return Math.abs(v - mean) > threshold && selectedMetric !== 'successRate'
      })
      .map((d) => ({
        date: d.date,
        value: (d as any)[metricConfig.dataKey] as number,
      }))
  }, [chartData, selectedMetric, metricConfig])

  /* ── Handlers ── */

  const handleBarClick = useCallback(async (data: any) => {
    if (!data?.activeLabel) return
    const date = series.find((s) => shortDate(s.date) === data.activeLabel)?.date
    if (!date) return

    if (drilldownDate === date) {
      setDrilldownDate(null)
      setHourlyData(null)
      return
    }

    setDrilldownDate(date)
    setHourlyLoading(true)
    try {
      const hd = await get<HourlyData>('/api/v1/admin/dashboard/trends/hourly', { date })
      setHourlyData(hd)
    } catch {
      setHourlyData(null)
    } finally {
      setHourlyLoading(false)
    }
  }, [series, drilldownDate])

  const customSubmit = () => {
    const d = parseInt(customDays)
    if (d >= 1 && d <= 365) {
      onDaysChange(d)
      setCustomOpen(false)
      setCustomDays('')
    }
  }

  const exportCSV = () => {
    const headers = ['日期', '星期', '调用量', '成功', '失败', '超时', '成功率%', 'Token', '成本', '响应(ms)', '新增用户', '营收']
    const rows = series.map((s) => [
      s.date, dayOfWeek(s.date),
      s.calls.total, s.calls.success, s.calls.failed, s.calls.timeout,
      s.calls.successRate, s.calls.totalTokens, s.calls.totalCost, s.calls.avgDuration,
      s.newUsers, s.revenue?.total ?? '0',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `overview_${days}d_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  /* ═══════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════ */

  // ── Time selector ──
  const renderTimeSelector = () => (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => opt.value === 0 ? setCustomOpen(true) : onDaysChange(opt.value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              opt.value === 0 && days !== 1 && days !== 7 && days !== 30 && days !== 90
                ? 'bg-white text-blue-600 shadow-sm'
                : opt.value === days
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <opt.icon size={12} />
            {opt.label}
            {opt.value === 0 && days !== 1 && days !== 7 && days !== 30 && days !== 90 && (
              <span className="ml-0.5 text-[10px]">({days}天)</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {/* Compare toggle */}
        <button
          onClick={() => setCompareMode(!compareMode)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            compareMode
              ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          }`}
        >
          <TrendingUp size={12} />
          对比上期
          {compareLoading && <Loader2 size={12} className="animate-spin ml-1" />}
        </button>

        {/* CSV export */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-500 border border-slate-200 hover:border-slate-300 transition"
          title="导出CSV"
        >
          <Download size={12} />
          导出
        </button>

        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-500 border border-slate-200 hover:border-slate-300 transition"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  )

  // ── Metric selector tabs ──
  const renderMetricTabs = () => (
    <div className="flex gap-1 bg-slate-50 rounded-lg p-0.5 overflow-x-auto">
      {METRICS.map((m) => {
        const active = selectedMetric === m.key
        return (
          <button
            key={m.key}
            onClick={() => setSelectedMetric(m.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition ${
              active
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <m.icon size={13} style={{ color: active ? m.color : undefined }} />
            {m.label}
          </button>
        )
      })}
    </div>
  )

  // ── Chart style tabs ──
  const renderChartStyleToggle = () => (
    <div className="flex gap-0.5 bg-slate-100 rounded-md p-0.5">
      {CHART_STYLES.map((cs) => (
        <button
          key={cs.key}
          onClick={() => setChartStyle(cs.key)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition ${
            chartStyle === cs.key
              ? 'bg-white text-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <cs.icon size={11} />
          {cs.label}
        </button>
      ))}
    </div>
  )

  // ── Stats summary bar (宝塔首页的风格) ──
  const renderStatsBar = () => {
    if (!summary) return null
    if (!showStats) return null

    const trendIcon = summary.trendDir === 'up' ? '↑' : summary.trendDir === 'down' ? '↓' : '→'
    const trendColor = summary.trendDir === 'up' ? 'text-red-500' : summary.trendDir === 'down' ? 'text-green-500' : 'text-slate-400'
    const changeColor = summary.change >= 0 ? 'text-red-500' : 'text-green-500'

    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs bg-white rounded-lg border border-slate-100 px-4 py-2.5">
        <span className="text-slate-500">
          总计: <strong className="text-slate-800">{metricConfig.format(summary.total)}</strong>
        </span>
        <span className="text-slate-500">
          日均: <strong className="text-slate-800">{metricConfig.format(summary.mean)}</strong>
        </span>
        <span className="text-slate-500">
          峰值日: <strong className="text-slate-800">{metricConfig.format(summary.max)}</strong>
        </span>
        <span className="text-slate-500">
          波动率: <strong className="text-slate-800">{summary.cv.toFixed(1)}%</strong>
        </span>
        <span className={`${trendColor} font-medium`}>
          {trendIcon} {summary.trendDir === 'up' ? '上升趋势' : summary.trendDir === 'down' ? '下降趋势' : '平稳'}
        </span>
        {series.length >= 7 && (
          <span className={`${changeColor} font-medium`}>
            后期 {summary.change >= 0 ? '+' : ''}{summary.change.toFixed(1)}%
          </span>
        )}
      </div>
    )
  }

  // ── Main chart ──
  // ── Skeleton loading ──
  const renderSkeleton = () => (
    <div className="h-[350px] flex items-center justify-center">
      <div className="w-full space-y-3 px-8 animate-pulse">
        <div className="flex justify-between">
          {[1,2,3,4,5].map(i => <div key={i} className="h-2 w-12 bg-slate-200 rounded" />)}
        </div>
        <div className="h-[200px] bg-slate-100 rounded-xl flex items-center justify-center">
          <div className="flex items-end gap-3 h-3/4">
            {[40,55,35,65,45,70,50,60,42,68,58,48].map((h,i) => (
              <div key={i} className="w-5 bg-gradient-to-t from-blue-200 to-blue-100 rounded-t"
                style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
        </div>
        <div className="flex justify-between">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-2 w-8 bg-slate-200 rounded" />)}
        </div>
      </div>
    </div>
  )

  const renderChart = () => {
    if (chartData.length === 0) {
      return renderSkeleton()
    }

    const dk = metricConfig.dataKey
    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 24, left: 8, bottom: 10 },
    }

    // Compare keys
    const prevKey = dk === 'calls' ? 'prevCalls'
      : dk === 'tokens' ? 'prevTokens'
      : dk === 'cost' ? 'prevCost'
      : dk === 'revenue' ? 'prevRevenue'
      : null

    const renderChartContent = () => {
      switch (chartStyle) {
        case 'bar':
          return (
            <BarChart {...commonProps} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<BaotaTooltip metric={selectedMetric} />} />
              <defs>
                <linearGradient id={`barGrad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metricConfig.color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={metricConfig.color} stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <Bar dataKey={dk} name={metricConfig.label} fill={`url(#barGrad)`} radius={[4, 4, 0, 0]} maxBarSize={36}
                isAnimationActive animationDuration={500} />
              {summary && (
                <ReferenceLine y={summary.mean} stroke="#e17055" strokeDasharray="4 4"
                  label={{ value: '均值', position: 'right', fontSize: 10, fill: '#e17055' }} />
              )}
              {/* Anomaly points */}
              {anomalies.map((a) => (
                <ReferenceDot key={a.date} x={shortDate(a.date)} y={a.value} r={5}
                  fill="#ef4444" stroke="#fff" strokeWidth={2} />
              ))}
            </BarChart>
          )

        case 'area':
          return (
            <AreaChart {...commonProps} onClick={handleBarClick}>
              <defs>
                <linearGradient id={`areaGrad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metricConfig.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={metricConfig.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<BaotaTooltip metric={selectedMetric} />} />
              <Area type="monotone" dataKey={dk} name={metricConfig.label} stroke={metricConfig.color}
                fill={`url(#areaGrad)`} strokeWidth={2.5} dot={false}
                isAnimationActive animationDuration={500} />
              {/* Compare overlay */}
              {compareMode && prevKey && (
                <Area type="monotone" dataKey={prevKey} name="上期" stroke={metricConfig.color}
                  fill="transparent" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.5} />
              )}
              {summary && (
                <ReferenceLine y={summary.mean} stroke="#e17055" strokeDasharray="4 4"
                  label={{ value: '均值', position: 'right', fontSize: 10, fill: '#e17055' }} />
              )}
              {anomalies.map((a) => (
                <ReferenceDot key={a.date} x={shortDate(a.date)} y={a.value} r={5}
                  fill="#ef4444" stroke="#fff" strokeWidth={2} />
              ))}
            </AreaChart>
          )

        case 'line':
        default:
          return (
            <LineChart {...commonProps} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<BaotaTooltip metric={selectedMetric} />} />
              <Line type="monotone" dataKey={dk} name={metricConfig.label} stroke={metricConfig.color}
                strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: metricConfig.color, strokeWidth: 2, fill: '#fff' }}
                isAnimationActive animationDuration={500} />
              {/* Compare overlay */}
              {compareMode && prevKey && (
                <Line type="monotone" dataKey={prevKey} name="上期" stroke={metricConfig.color}
                  strokeWidth={1.5} strokeDasharray="6 3" dot={false} opacity={0.5} />
              )}
              {summary && (
                <ReferenceLine y={summary.mean} stroke="#e17055" strokeDasharray="4 4"
                  label={{ value: '均值', position: 'right', fontSize: 10, fill: '#e17055' }} />
              )}
              {anomalies.map((a) => (
                <ReferenceDot key={a.date} x={shortDate(a.date)} y={a.value} r={5}
                  fill="#ef4444" stroke="#fff" strokeWidth={2} />
              ))}
            </LineChart>
          )
      }
    }

    return (
      <ResponsiveContainer width="100%" height={360}>
        {renderChartContent()}
      </ResponsiveContainer>
    )
  }

  // ── Hourly drilldown (宝塔24h热力图风格) ──
  const renderHourlyDrilldown = () => {
    if (!drilldownDate || (!hourlyData && hourlyLoading)) {
      if (hourlyLoading) {
        return (
          <div className="flex items-center justify-center py-8 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" />
            加载时段数据...
          </div>
        )
      }
      return null
    }
    if (!hourlyData) return null

    const maxVal = Math.max(...hourlyData.hours.map((h) => h.total), 1)
    const peakHour = hourlyData.peakHour

    return (
      <div className="bg-white rounded-xl shadow-sm border border-indigo-200 overflow-hidden animate-in fade-in duration-300">
        <div className="px-4 py-3 border-b border-indigo-100 flex items-center justify-between bg-indigo-50">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-indigo-600" />
            <h3 className="text-sm font-semibold text-indigo-800">
              {drilldownDate} · 24h 时段分布
            </h3>
            <span className="text-[11px] text-indigo-500">
              全天 {hourlyData.total.toLocaleString()} 次调用
            </span>
          </div>
          <button
            onClick={() => { setDrilldownDate(null); setHourlyData(null) }}
            className="p-1 text-indigo-400 hover:text-indigo-600 transition rounded hover:bg-indigo-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {/* 24h 热力柱状图 (类似宝塔的网络流量24h图) */}
          <svg viewBox="0 0 720 100" className="w-full" style={{ height: 64 }}>
            <defs>
              <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.75} />
                <stop offset="100%" stopColor="#a5b4fc" stopOpacity={0.25} />
              </linearGradient>
            </defs>
            {hourlyData.hours.map((h, i) => {
              const bw = 26
              const gap = 4
              const x = i * (bw + gap)
              const hgt = Math.max(1, (h.total / Math.max(maxVal, 1)) * 68)
              const y = 72 - hgt
              const isPeak = h.hour === peakHour.hour
              return (
                <g key={h.hour}>
                  <rect x={x} y={y} width={bw} height={hgt} rx={2}
                    fill={isPeak ? '#ef4444' : 'url(#hourGrad)'}
                    opacity={isPeak ? 0.9 : h.total === 0 ? 0.2 : 0.6}
                  >
                    <title>{formatHour(h.hour)}: {h.total.toLocaleString()} 次</title>
                  </rect>
                  {isPeak && (
                    <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="7" fill="#dc2626" fontWeight="bold">
                      🔺
                    </text>
                  )}
                </g>
              )
            })}
            {hourlyData.hours.filter((h) => h.hour % 3 === 0).map((h) => (
              <text key={h.hour} x={h.hour * 30 + 12} y={86} textAnchor="middle" fontSize="6" fill="#94a3b8">
                {formatHour(h.hour)}
              </text>
            ))}
          </svg>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-[11px] font-medium">
              <Zap size={12} />
              峰值 {formatHour(peakHour.hour)} · {peakHour.total.toLocaleString()} 次
            </span>
            {peakHour.topModels.slice(0, 3).map((m, i) => (
              <span key={m.modelName}
                className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] ${
                  i === 0 ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-slate-50 text-slate-600'
                }`}
              >
                #{i + 1} {m.modelName}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════
     Main Render
     ═══════════════════════════════════════════════════ */

  return (
    <div className="bg-gradient-to-b from-slate-50/40 to-white rounded-2xl border border-slate-200/60 overflow-hidden">
      {/* ── Header: 总览趋势 ── */}
      <div className="px-5 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">总览趋势</h2>
            {loading && <Loader2 size={14} className="animate-spin text-blue-500" />}
          </div>
          <div className="flex items-center gap-2">
            {renderChartStyleToggle()}
            <button
              onClick={() => setShowStats(!showStats)}
              className={`text-[11px] px-2 py-1 rounded transition ${
                showStats ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {showStats ? '隐藏统计' : '显示统计'}
            </button>
          </div>
        </div>

        {/* 时间选择器 */}
        {renderTimeSelector()}

        {/* 指标选择 */}
        <div className="mt-3">
          {renderMetricTabs()}
        </div>
      </div>

      {/* ── 统计摘要栏 ── */}
      <div className="px-5 pt-3">
        {renderStatsBar()}
      </div>

      {/* ── 主趋势图 ── */}
      <div className="px-5 pt-4 pb-2">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="p-2">
            {renderChart()}
          </div>
        </div>

        {/* 图例说明 - 点击日期下钻 */}
        {chartData.length > 0 && (
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            💡 点击数据点可展开当日时段分布
            {compareMode && ' · 虚线 = 上期数据'}
          </p>
        )}
      </div>

      {/* ── 小时级下钻 ── */}
      <div className="px-5 pb-5">
        {renderHourlyDrilldown()}
      </div>

      {/* ── Custom date modal ── */}
      {customOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">自定义天数</h3>
              <button onClick={() => setCustomOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              placeholder="输入天数 (1-365)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCustomOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
              <button onClick={customSubmit}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
