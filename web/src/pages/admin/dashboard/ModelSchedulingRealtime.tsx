// ============================================================
//  3cloud (3C) — 模型调度实时曲线图
//  实时监控 RPM/TPM 分钟级曲线 + 当前调度决策分布
//  数据来源：Redis 计数器（零 PG 开销）
//  智能轮询：15s 可见 → 60s 后台 → 停止隐藏
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { SchedulingRealtime } from '@/types'
import {
  Loader2, RefreshCw, Activity, BarChart3, Clock, AlertCircle,
} from 'lucide-react'

/* ── 模型颜色映射（前 10 名固定色） ── */

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

/* ── Tooltip 自定义渲染 ── */

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
              <span className="text-slate-600 truncate max-w-[120px]">{entry.name}</span>
            </span>
            <span className="font-mono font-medium text-slate-800">
              {typeof entry.value === 'number'
                ? entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
      {payload[0]?.payload?._extra && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-slate-400">
          {payload[0].payload._extra}
        </div>
      )}
    </div>
  )
}

/* ── 数字格式化 ── */

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
}

/* ════════════════════════════════════════
   Main Component
   ════════════════════════════════════════ */

export default function ModelSchedulingRealtime() {
  const [data, setData] = useState<SchedulingRealtime | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [isPolling, setIsPolling] = useState(true)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const visibleRef = useRef(true)

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
        // 切换到后台标签页：降低轮询频率
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = setInterval(fetchData, 60000)
      } else {
        // 切换回可见：立即刷新 + 加快轮询
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

  // ── 停止轮询 ──
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

  // ── 时间切换 ──
  const handleTimeChange = (m: number) => {
    setMinutes(m)
    // fetchData will be triggered by useEffect
  }

  // ── 准备图表数据 ──
  const activeModels = data
    ? Array.from(
        new Set(
          data.series.flatMap((s) => s.models.map((m) => m.modelName)),
        ),
      ).slice(0, 8) // Top 8 模型
    : []

  // RPM 数据: 每个 time 点 + 每个模型的 RPM
  const rpmChartData = data?.series.map((s) => {
    const point: Record<string, any> = { time: s.time, _extra: s.rpm > 0 ? `总量: ${s.rpm}` : '' }
    for (const m of s.models) {
      point[m.modelName] = m.rpm
    }
    return point
  }) ?? []

  // TPM 数据
  const tpmChartData = data?.series.map((s) => {
    const point: Record<string, any> = { time: s.time, _extra: s.tpm > 0 ? `总量: ${fmtNum(s.tpm)}` : '' }
    // 转成万
    for (const m of s.models) {
      point[m.modelName] = Math.round(m.tpm / 10000)
    }
    return point
  }) ?? []

  // ── 摘要卡片 ──
  const summary = data?.summary
  const summaryCards = summary
    ? [
        { label: '当前 RPM', value: summary.totalRpm.toLocaleString(), sub: `峰值 ${fmtNum(summary.peakRpm)}`, color: 'text-blue-600 bg-blue-50' },
        { label: '当前 TPM', value: fmtNum(summary.totalTpm), sub: `峰值 ${fmtNum(summary.peakTpm)}`, color: 'text-violet-600 bg-violet-50' },
        { label: '平均延迟', value: `${summary.avgLatencyRecent || summary.avgLatencyMs}ms`, sub: '过去 N 分钟', color: 'text-amber-600 bg-amber-50' },
        { label: '模型/厂商', value: `${summary.modelCount} / ${summary.vendorCount}`, sub: '覆盖', color: 'text-emerald-600 bg-emerald-50' },
      ]
    : []

  // ── Loading ──
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={24} />
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
            {[15, 30, 60, 120].map((m) => (
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
            className={`p-1.5 rounded-lg transition ${
              isPolling ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'
            }`}
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
            <p className="text-lg font-bold text-slate-800">{card.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 更新时间 ── */}
      {data?.lastUpdated && (
        <p className="text-[10px] text-slate-400 text-right">
          上次更新: {new Date(data.lastUpdated).toLocaleTimeString('zh-CN')}
          {isPolling && ' · 自动刷新中'}
        </p>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2.5 rounded-lg text-xs">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── RPM 曲线图 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <BarChart3 size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">RPM 实时曲线（请求/分钟）</h3>
        </div>
        <div className="p-4">
          {activeModels.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">暂无实时数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rpmChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#bbb" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} stroke="#bbb" />
                <Tooltip content={customTooltip} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                {activeModels.map((model, i) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    stroke={getModelColor(model, i)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name={model}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── TPM 曲线图 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <BarChart3 size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">TPM 实时曲线（Token/分钟 · 万）</h3>
        </div>
        <div className="p-4">
          {activeModels.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">暂无实时数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tpmChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#bbb" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} stroke="#bbb" />
                <Tooltip content={customTooltip} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                {activeModels.map((model, i) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    stroke={getModelColor(model, i)}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    activeDot={{ r: 3 }}
                    name={model}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 当前调度决策分布 ── */}
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
                    {/* 内部按 topModels 比例进一步分色 */}
                    {dist.topModels.length > 0 ? (
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
                        style={{
                          width: '100%',
                          background: 'linear-gradient(90deg, #0984e3, #74b9ff)',
                        }}
                      />
                    )}
                  </div>
                  {dist.topModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {dist.topModels.map((m, i) => (
                        <span
                          key={m.modelName}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            background: getModelColor(m.modelName, i) + '15',
                            color: getModelColor(m.modelName, i),
                          }}
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

      {/* ── 无数据提示 ── */}
      {(!data?.series || data.series.every((s) => s.rpm === 0)) && (
        <div className="text-center py-8 text-sm text-slate-400 bg-white rounded-xl border border-slate-200">
          <Activity size={24} className="mx-auto text-slate-300 mb-2" />
          暂无调度数据，等待首次 API 调用...
        </div>
      )}

      {/* 图例说明 */}
      {activeModels.length > 0 && (
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="block w-4 h-[2px] bg-blue-500 rounded" /> RPM
          </span>
          <span className="flex items-center gap-1">
            <span className="block w-4 h-[2px] border-t-2 border-dashed border-violet-500" /> TPM
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">数据来源: Redis · 零 DB 开销</span>
        </div>
      )}

    </div>
  )
}
