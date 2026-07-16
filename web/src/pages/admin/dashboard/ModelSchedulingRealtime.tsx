// ============================================================
//  3cloud (3C) — 模型调度实时曲线图（借鉴宝塔监控UI设计哲学）
//  RPM/TPM 独立指标 Tab + 统计摘要 + 均值红线 + 异常标记
//  数据来源：Redis 计数器（零 PG 开销）
//  智能轮询：15s 可见 → 60s 后台 → 停止隐藏
// ============================================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { get } from '@/lib/api'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, ReferenceDot,
} from 'recharts'
import type { SchedulingRealtime } from '@/types'
import {
  Loader2, RefreshCw, Activity, BarChart3, Clock, AlertCircle,
  TrendingUp, Zap, ChevronUp, Download,
} from 'lucide-react'

/* ── 模型颜色映射 ── */

const MODEL_COLORS: Record<string, string> = {
  'deepseek-v4-pro': '#0984e3',
  'deepseek-v4-flash': '#00b894',
  'gpt-4o': '#6c5ce7',
  'gpt-4o-mini': '#a29bfe',
  'claude-sonnet': '#ff6b6b',
  'claude-haiku': '#ffa502',
  'gemini-pro': '#2ed573',
  'qwen-turbo': '#1e90ff',
  'qwen-plus': '#ff6348',
  'kimi-k2.6': '#fd79a8',
}

const FALLBACK_COLORS = [
  '#95a5a6', '#e17055', '#00cec9', '#fdcb6e',
  '#636e72', '#b2bec3', '#dfe6e9', '#74b9ff',
]

function getModelColor(modelName: string, idx: number): string {
  return MODEL_COLORS[modelName] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

/* ── 指标配置 ── */

type MetricTab = 'rpm' | 'tpm'
type ChartStyle = 'line' | 'area'

const METRIC_TABS: { key: MetricTab; label: string; icon: any; color: string; unit: string }[] = [
  { key: 'rpm', label: 'RPM', icon: Activity, color: '#0984e3', unit: '请求/分' },
  { key: 'tpm', label: 'TPM', icon: Zap, color: '#6c5ce7', unit: 'Token/分 · 万' },
]

const CHART_STYLES: { key: ChartStyle; label: string; icon: any }[] = [
  { key: 'line', label: '折线', icon: TrendingUp },
  { key: 'area', label: '面积', icon: Activity },
]

/* ── 格式化 ── */

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
}

function fmtRpm(n: number): string {
  return n.toLocaleString()
}

function fmtTpm(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

/* ── 统计工具 ── */

function calcStats(values: number[]) {
  if (values.length === 0) return { avg: 0, max: 0, min: 0, stdDev: 0, cv: 0, trend: 'flat' as const }
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length
  const stdDev = Math.sqrt(variance)
  const cv = avg > 0 ? stdDev / avg : 0
  const trend = values.length >= 2
    ? (values[values.length - 1] > values[0] ? 'up' : values[values.length - 1] < values[0] ? 'down' : 'flat')
    : 'flat'
  return { avg, max, min, stdDev, cv: Math.round(cv * 100), trend: trend as 'up' | 'down' | 'flat' }
}

/* ── 异常检测（2σ 偏离） ── */

function findAnomalies(points: { time: string; value: number }[]) {
  const values = points.map(p => p.value)
  if (values.length < 3) return []
  const { avg, stdDev } = calcStats(values)
  const threshold = stdDev * 2
  return points
    .filter(p => p.value > 0 && Math.abs(p.value - avg) > threshold)
    .map(p => ({ ...p, anomaly: true }))
}

/* ── Tooltip ── */

function customTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-3 text-xs max-w-[300px]">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
              <span className={`text-slate-600 truncate max-w-[120px] ${entry.dashArray ? 'italic' : ''}`}>
                {entry.name}
              </span>
            </span>
            <span className="font-mono font-medium text-slate-800">
              {typeof entry.value === 'number'
                ? entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   Main Component
   ════════════════════════════════════════ */

export default function ModelSchedulingRealtime() {
  const [data, setData] = useState<SchedulingRealtime | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [isPolling, setIsPolling] = useState(true)
  const [metricTab, setMetricTab] = useState<MetricTab>('rpm')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line')
  const [showAvgLine, setShowAvgLine] = useState(true)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 获取数据 ──
  const fetchData = useCallback(async () => {
    try {
      const res = await get<SchedulingRealtime>(
        `/api/v1/admin/dashboard/scheduling-realtime?minutes=${minutes}`,
      )
      setData(res)
      setError('')
    } catch (err: any) {
      setError(err.message || '获取调度实时数据失败')
    } finally {
      setLoading(false)
    }
  }, [minutes])

  // ── 智能轮询 ──
  useEffect(() => {
    fetchData()
    const schedulePoll = () => {
      const interval = document.hidden ? 60000 : 15000
      pollingRef.current = setInterval(fetchData, interval)
    }
    const onVisibility = () => {
      if (document.hidden) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = setInterval(fetchData, 60000)
      } else {
        if (pollingRef.current) clearInterval(pollingRef.current)
        fetchData()
        pollingRef.current = setInterval(fetchData, 15000)
      }
    }
    schedulePoll()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchData])

  const togglePolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
      setIsPolling(false)
    } else {
      fetchData()
      const interval = document.hidden ? 60000 : 15000
      pollingRef.current = setInterval(fetchData, interval)
      setIsPolling(true)
    }
  }

  const handleTimeChange = (m: number) => setMinutes(m)

  // ── 准备图表数据 ──
  const activeModels = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.series.flatMap(s => s.models.map(m => m.modelName)))).slice(0, 8)
  }, [data])

  const rpmChartData = useMemo(() => {
    if (!data) return []
    return data.series.map(s => {
      const point: Record<string, any> = { time: s.time, _rpm: s.rpm, _extra: s.rpm > 0 ? `总量: ${fmtRpm(s.rpm)}` : '' }
      for (const m of s.models) point[m.modelName] = m.rpm
      return point
    })
  }, [data])

  const tpmChartData = useMemo(() => {
    if (!data) return []
    return data.series.map(s => {
      const val = Math.round(s.tpm / 10000)
      const point: Record<string, any> = { time: s.time, _tpm: val, _extra: s.tpm > 0 ? `总量: ${fmtTpm(s.tpm)}` : '' }
      for (const m of s.models) point[m.modelName] = Math.round(m.tpm / 10000)
      return point
    })
  }, [data])

  // ── 当前选中指标的数据 ──
  const activeChartData = metricTab === 'rpm' ? rpmChartData : tpmChartData
  const activeDataKey = metricTab === 'rpm' ? '_rpm' : '_tpm'
  const config = METRIC_TABS.find(t => t.key === metricTab)!

  // ── 摘要统计 ──
  const rawTotalValues = useMemo(() => {
    return activeChartData.map(d => d[activeDataKey] as number || 0)
  }, [activeChartData, activeDataKey])

  const stats = useMemo(() => calcStats(rawTotalValues), [rawTotalValues])

  // ── 异常点 ──
  const anomalies = useMemo(() => {
    const points = activeChartData.map(d => ({ time: d.time, value: d[activeDataKey] as number || 0 }))
    return findAnomalies(points)
  }, [activeChartData, activeDataKey])

  // ── 摘要卡片 ──
  const summary = data?.summary
  const summaryCards = useMemo(() => {
    if (!summary) return []
    return [
      { label: '当前 RPM', value: summary.totalRpm.toLocaleString(), sub: `峰值 ${fmtNum(summary.peakRpm)}`, trend: summary.totalRpm > 0 ? 'up' as const : 'flat' as const },
      { label: '当前 TPM', value: fmtNum(summary.totalTpm), sub: `峰值 ${fmtNum(summary.peakTpm)}`, trend: summary.totalTpm > 0 ? 'up' as const : 'flat' as const },
      { label: '平均延迟', value: `${summary.avgLatencyRecent || summary.avgLatencyMs}ms`, sub: '过去 N 分钟', trend: 'flat' as const },
      { label: '模型/厂商', value: `${summary.modelCount} / ${summary.vendorCount}`, sub: '覆盖', trend: 'flat' as const },
    ]
  }, [summary])

  // ── 导出CSV ──
  const handleExportCsv = useCallback(() => {
    if (!data?.series?.length) return
    const separator = ','
    const headers = ['时间', metricTab === 'rpm' ? 'RPM' : 'TPM(万)', ...activeModels]
    const rows = activeChartData.map(point => {
      return headers.map(h => {
        if (h === '时间') return point.time
        const val = point[h]
        return val !== undefined ? val : ''
      }).join(separator)
    })
    const csv = [headers.join(separator), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${metricTab.toUpperCase()}_实时曲线_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, activeChartData, activeModels, metricTab])

  // ── Loading ──
  if (loading && !data) {
    return (
      <div className="space-y-4">
        {/* Skeletons mimic real layout */}
        <div className="flex items-center justify-between animate-pulse">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="h-8 w-36 bg-slate-200 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 animate-pulse">
              <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
              <div className="h-6 w-20 bg-slate-200 rounded mb-1" />
              <div className="h-3 w-12 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
          <div className="h-[280px] flex items-center justify-center">
            <div className="flex items-end gap-3 h-3/4 w-3/4">
              {[35,50,30,60,45,70,55,40,65,48,52,38].map((h,i) => (
                <div key={i} className="flex-1 bg-gradient-to-t from-blue-200 to-blue-100 rounded-t"
                  style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        {error}
        <button onClick={fetchData} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">
          重试
        </button>
      </div>
    )
  }

  const hasData = data?.series?.length && data.series.some(s => s.rpm > 0)

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">⚡ 模型调度实时监控</h2>
          <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
            isPolling ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isPolling ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
            {isPolling ? '实时' : '已暂停'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
            {[60, 180, 360, 720, 1440].map((m) => (
              <button
                key={m}
                onClick={() => handleTimeChange(m)}
                className={`px-2.5 py-1 rounded-md transition ${
                  minutes === m ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m < 60 ? `${m}分` : `${m / 60}h`}
              </button>
            ))}
          </div>
          <button
            onClick={togglePolling}
            className={`p-1.5 rounded-lg transition ${isPolling ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
            title={isPolling ? '暂停轮询' : '恢复轮询'}
          >
            <Clock size={15} />
          </button>
          <button
            onClick={fetchData}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
            title="立即刷新"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
            <p className="text-[11px] text-slate-500">{card.label}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-lg font-bold text-slate-800">{card.value}</p>
              {card.trend === 'up' && (
                <span className="flex items-center text-[10px] text-green-500">
                  <ChevronUp size={12} /> ↑
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 主图表卡片 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* ── 指标 Tab + 控制栏 ── */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          {/* 指标 Tab（类似宝塔 CPU/内存/磁盘独立查看） */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {METRIC_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = metricTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setMetricTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white shadow-sm text-slate-800'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={14} color={isActive ? tab.color : undefined} />
                  <span>{tab.label}</span>
                  <span className="text-[10px] text-slate-400">{tab.unit}</span>
                </button>
              )
            })}
          </div>
          {/* 右侧控件 */}
          <div className="flex items-center gap-2">
            {/* 均值红线开关 */}
            <button
              onClick={() => setShowAvgLine(v => !v)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition ${
                showAvgLine ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              <span className="w-3 h-[2px] bg-red-500 rounded" />
              均值线
            </button>
            {/* 图表类型切换 */}
            <div className="flex bg-slate-100 rounded-md p-0.5">
              {CHART_STYLES.map((st) => {
                const StIcon = st.icon
                return (
                  <button
                    key={st.key}
                    onClick={() => setChartStyle(st.key)}
                    className={`p-1.5 rounded text-[11px] transition ${
                      chartStyle === st.key ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'
                    }`}
                    title={st.label}
                  >
                    <StIcon size={14} />
                  </button>
                )
              })}
            </div>
            {/* CSV导出 */}
            {hasData && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 text-[11px] px-2 py-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                title="导出 CSV"
              >
                <Download size={13} />
                导出
              </button>
            )}
          </div>
        </div>

        {/* ── 统计摘要条 ── */}
        {hasData && (
          <div className="px-5 py-2.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center gap-4 text-xs flex-wrap">
            <span className="text-slate-600">
              总计 <strong className="text-slate-800">{fmtNum(rawTotalValues.reduce((a, b) => a + b, 0))}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              峰值 <strong className={`${
                metricTab === 'rpm' ? 'text-blue-600' : 'text-violet-600'
              }`}>{stats.max.toLocaleString()}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              均值 <strong className="text-slate-800">{stats.avg.toFixed(1)}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              波动率 <strong className={`${
                stats.cv > 50 ? 'text-red-500' : stats.cv > 25 ? 'text-amber-500' : 'text-slate-800'
              }`}>{stats.cv}%</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1 text-slate-600">
              趋势
              {stats.trend === 'up' ? (
                <span className="flex items-center text-green-600 font-medium">
                  <ChevronUp size={12} /> 上升
                </span>
              ) : stats.trend === 'down' ? (
                <span className="flex items-center text-red-500 font-medium">
                  <span className="transform rotate-180 inline-block"><ChevronUp size={12} /></span> 下降
                </span>
              ) : (
                <span className="text-slate-400">平稳</span>
              )}
            </span>
          </div>
        )}

        {/* ── 图表 ── */}
        <div className="p-5">
          {!hasData ? (
            <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
              <div className="text-center">
                <Activity size={28} className="mx-auto text-slate-300 mb-2" />
                暂无实时数据，等待首次 API 调用...
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              {chartStyle === 'line' ? (
                <LineChart data={activeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#bbb" interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="#bbb"
                    label={{
                      value: config.unit,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 10, fill: '#999' },
                    }}
                  />
                  <Tooltip content={customTooltip} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {/* 均值红线 */}
                  {showAvgLine && stats.avg > 0 && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="#e17055"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      label={{
                        value: `均值 ${stats.avg.toFixed(1)}`,
                        position: 'insideTopRight',
                        style: { fontSize: 10, fill: '#e17055' },
                      }}
                    />
                  )}
                  {/* 异常点标记 */}
                  {anomalies.map((a, i) => (
                    <ReferenceDot
                      key={i}
                      x={a.time}
                      y={a.value}
                      r={5}
                      fill="#ff4757"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                  {/* 各模型线 */}
                  {activeModels.map((model, i) => (
                    <Line
                      key={model}
                      type="monotone"
                      dataKey={model}
                      stroke={getModelColor(model, i)}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name={model}
                      connectNulls
                      isAnimationActive animationDuration={400}
                    />
                  ))}
                </LineChart>
              ) : (
                <AreaChart data={activeChartData}>
                  <defs>
                    {METRIC_TABS.map(tab => (
                      <linearGradient key={tab.key} id={`realtimeGrad${tab.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={tab.color} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={tab.color} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#bbb" interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="#bbb"
                    label={{
                      value: config.unit,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 10, fill: '#999' },
                    }}
                  />
                  <Tooltip content={customTooltip} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {showAvgLine && stats.avg > 0 && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="#e17055"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      label={{
                        value: `均值 ${stats.avg.toFixed(1)}`,
                        position: 'insideTopRight',
                        style: { fontSize: 10, fill: '#e17055' },
                      }}
                    />
                  )}
                  {anomalies.map((a, i) => (
                    <ReferenceDot
                      key={i}
                      x={a.time}
                      y={a.value}
                      r={5}
                      fill="#ff4757"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                  {activeModels.map((model, i) => (
                    <Area
                      key={model}
                      type="monotone"
                      dataKey={model}
                      stroke={getModelColor(model, i)}
                      fill={`url(#realtimeGrad${metricTab})`}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name={model}
                      connectNulls
                      isAnimationActive animationDuration={400}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>

        {/* ── 底部信息 ── */}
        <div className="px-5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-3">
            {/* 异常标记图例 */}
            {anomalies.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                异常点 {anomalies.length} 处
              </span>
            )}
            {data?.lastUpdated && (
              <span>
                上次更新: {new Date(data.lastUpdated).toLocaleTimeString('zh-CN')}
                {isPolling && ' · 自动刷新中'}
              </span>
            )}
          </div>
          <span className="text-slate-300">数据来源: Redis · 零 DB 开销</span>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2.5 rounded-lg text-xs">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── 当前调度决策分布（保留原功能） ── */}
      {data?.currentDistribution && data.currentDistribution.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Activity size={15} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">🧭 当前调度分布（最近1分钟）</h3>
          </div>
          <div className="p-5 space-y-4">
            {data.currentDistribution
              .sort((a, b) => b.rpm - a.rpm)
              .slice(0, 8)
              .map((dist) => (
                <div key={dist.vendorName}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{dist.vendorName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-800">{dist.rpm.toLocaleString()} RPM</span>
                      <span className={`text-[11px] font-medium ${
                        dist.percentage >= 30 ? 'text-emerald-600' :
                        dist.percentage >= 10 ? 'text-amber-600' : 'text-slate-400'
                      }`}>{dist.percentage}%</span>
                      <span className="text-[11px] text-slate-400">{dist.avgLatencyMs}ms</span>
                    </div>
                  </div>
                  <div className="h-5 bg-slate-100 rounded overflow-hidden flex">
                    {dist.topModels?.length ? (
                      dist.topModels.map((m, i) => {
                        const pct = dist.rpm > 0 ? (m.rpm / dist.rpm) * 100 : 0
                        if (pct < 0.5) return null
                        return (
                          <div
                            key={m.modelName}
                            className="h-full transition-all duration-300 first:rounded-l last:rounded-r"
                            style={{
                              width: `${pct}%`,
                              background: getModelColor(m.modelName, i),
                              opacity: 0.8,
                            }}
                            title={`${m.modelName}: ${m.rpm} RPM`}
                          />
                        )
                      })
                    ) : (
                      <div
                        className="h-full rounded"
                        style={{ width: '100%', background: 'linear-gradient(90deg, #0984e3, #74b9ff)' }}
                      />
                    )}
                  </div>
                  {dist.topModels?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {dist.topModels.map((m, i) => (
                        <span
                          key={m.modelName}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: getModelColor(m.modelName, i) + '15', color: getModelColor(m.modelName, i) }}
                        >
                          {m.modelName} {m.rpm.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 图例说明 ── */}
      {hasData && (
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="block w-4 h-[2px] bg-blue-500 rounded" /> RPM
          </span>
          <span className="flex items-center gap-1">
            <span className="block w-4 h-[2px] bg-violet-500 rounded" /> TPM
          </span>
          {showAvgLine && (
            <span className="flex items-center gap-1">
              <span className="block w-4 h-[2px] border-t-2 border-dashed border-red-500" />
              均值
            </span>
          )}
          {anomalies.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 border border-white" />
              异常
            </span>
          )}
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">{metricTab === 'rpm' ? '请求/分钟' : 'Token/分钟 (万)'}</span>
        </div>
      )}

    </div>
  )
}
