import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { ApiKey, PaginatedData } from '@/types'
import {
  Loader2, AlertCircle, BarChart3, Activity, Cpu, DollarSign, Clock,
  TrendingUp, PieChart, Download, Zap, Key, ChevronDown, ChevronRight,
} from 'lucide-react'

// ── Types ──

interface UsageStats {
  period: string
  startDate: string
  endDate: string
  totalCalls: number
  successCalls: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: string
  avgDuration: number
  successRate: number
}

interface ModelUsageItem {
  modelName: string
  totalCalls: number
  successCalls: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: string
  avgDuration: number
  successRate: number
}

interface DailySeriesItem {
  date: string
  totalCalls: number
  totalTokens: number
  totalCost: string
}

interface LogSummaryToday {
  calls: number
  tokens: number
  cost: string
  successCount: number
  failedCount: number
  avgDurationMs: number
}

interface LogSummary {
  today: LogSummaryToday
  yesterday: LogSummaryToday
  month: { calls: number; tokens: number; cost: string }
}

interface KeyUsageDeep {
  keyName: string
  today: { calls: number; tokens: number; cost: string; successCount: number; failedCount: number; avgDurationMs: number }
  month: { calls: number; tokens: number; cost: string; successCount: number; failedCount: number }
  allTime: { calls: number; tokens: number; cost: string }
  trends: Array<{ date: string; calls: number; tokens: number; cost: string }>
  hourlyTrends: Array<{ hour: number; calls: number; tokens: number }>
  modelBreakdown: Array<{ modelName: string; calls: number; tokens: number; cost: string; successCount: number; failedCount: number }>
  allKeysSummary: Array<{ keyId: number; keyName: string; calls: number; tokens: number; cost: string }>
}

interface KeyAggregateData {
  trends: Array<{ date: string; calls: number; tokens: number; cost: string }>
  hourlyTrends: Array<{ hour: number; calls: number; tokens: number }>
}

const PERIODS = [
  { value: '7d' as const, label: '近7天' },
  { value: '30d' as const, label: '近30天' },
]

// ── Helpers ──

function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(6)}`
  if (n >= 1000) return `¥${(n / 1000).toFixed(1)}k`
  return `¥${n.toFixed(2)}`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

// ── Page ──

export default function Stats() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const [tab, setTab] = useState<'overview' | 'models' | 'trends' | 'keys'>('overview')

  // Period stats
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(true)

  // Model breakdown
  const [modelStats, setModelStats] = useState<ModelUsageItem[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  // Daily series
  const [dailySeries, setDailySeries] = useState<DailySeriesItem[]>([])
  const [loadingDaily, setLoadingDaily] = useState(true)

  // Today summary (from logs/summary)
  const [logSummary, setLogSummary] = useState<LogSummary | null>(null)
  const [loadingLogSummary, setLoadingLogSummary] = useState(false)

  // API Keys
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)

  // Expanded key usage
  const [expandedKeyId, setExpandedKeyId] = useState<number | null>(null)

  const [error, setError] = useState('')

  const fetchAll = useCallback(async () => {
    setError('')
    setLoadingUsage(true)
    setLoadingModels(true)
    setLoadingDaily(true)

    const days = period === '7d' ? 7 : 30

    try {
      const [usageData, modelData, dailyData] = await Promise.all([
        get<UsageStats>('/api/v1/me/stats/usage', { period }),
        get<{ items: ModelUsageItem[] }>('/api/v1/me/stats/by-model', { period, limit: 20 }),
        get<{ series: DailySeriesItem[] }>('/api/v1/me/stats/daily', { days }),
      ])
      setUsage(usageData)
      setModelStats(modelData.items)
      setDailySeries(dailyData.series)
    } catch (err: any) {
      setError(err.message || '获取用量统计失败')
    } finally {
      setLoadingUsage(false)
      setLoadingModels(false)
      setLoadingDaily(false)
    }
  }, [period])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Fetch today data for overview tab ──
  const fetchLogSummary = useCallback(async () => {
    setLoadingLogSummary(true)
    try {
      const data = await get<LogSummary>('/api/v1/logs/summary')
      setLogSummary(data)
    } catch {
      setLogSummary(null)
    } finally {
      setLoadingLogSummary(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'overview') fetchLogSummary()
  }, [tab, fetchLogSummary])

  // ── Fetch API keys for per-key tab ──
  const fetchKeys = useCallback(async () => {
    setLoadingKeys(true)
    try {
      const data = await get<PaginatedData<ApiKey>>('/api/v1/api-keys')
      setKeys(data.list)
    } catch {
      setKeys([])
    } finally {
      setLoadingKeys(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'keys') fetchKeys()
  }, [tab, fetchKeys])

  // ── Export helpers ──
  const handleExport = (dataType: string) => {
    const csvRows: string[] = []
    if (dataType === 'models' && modelStats.length > 0) {
      csvRows.push('模型,调用次数,Token,花费,成功率')
      modelStats.forEach(m => {
        csvRows.push(`${m.modelName},${m.totalCalls},${m.totalTokens},${m.totalCost},${m.successRate}%`)
      })
    } else if (dataType === 'daily' && dailySeries.length > 0) {
      csvRows.push('日期,调用次数,Token,花费')
      dailySeries.forEach(d => {
        csvRows.push(`${d.date},${d.totalCalls},${d.totalTokens},${d.totalCost}`)
      })
    } else if (dataType === 'summary' && usage) {
      csvRows.push('指标,数值')
      csvRows.push(`总调用,${usage.totalCalls}`)
      csvRows.push(`成功率,${usage.successRate}%`)
      csvRows.push(`总Token,${usage.totalTokens}`)
      csvRows.push(`总消费,${usage.totalCost}`)
      csvRows.push(`平均延迟,${usage.avgDuration}ms`)
    } else if (dataType === 'keys' && keys.length > 0) {
      csvRows.push('密钥名称,密钥前缀,状态,最后使用,创建时间')
      keys.forEach(k => {
        csvRows.push(`${k.name},${k.keyPrefix},${k.status ? '启用' : '停用'},${k.lastUsedAt || '-'},${k.createdAt}`)
      })
    }
    if (csvRows.length > 0) {
      const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `my_usage_${dataType}_${period}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  // ── Trending data ──
  const trendDays = dailySeries
  const maxTrendTokens = Math.max(1, ...trendDays.map(d => Number(d.totalTokens)))
  const sortedModels = [...modelStats].sort((a, b) => Number(b.totalTokens) - Number(a.totalTokens))
  const today = logSummary?.today

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">我的用量统计</h1>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-2 text-sm rounded-md transition ${
                period === p.value
                  ? 'bg-white text-slate-900 shadow-sm font-medium'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { k: 'overview' as const, label: '概览', icon: BarChart3 },
          { k: 'models' as const, label: '按模型', icon: PieChart },
          { k: 'trends' as const, label: '趋势', icon: TrendingUp },
          { k: 'keys' as const, label: '按Key', icon: Key },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: 概览 ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {loadingUsage ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : usage ? (
            <>
              {/* 4 colored stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  {
                    label: '今日调用',
                    v: today ? today.calls.toLocaleString() : (trendDays.length > 0 ? trendDays[trendDays.length - 1].totalCalls.toLocaleString() : '—'),
                    sub: today ? `${today.successCount} 成功 / ${today.failedCount} 失败` : '',
                    color: 'border-blue-200 bg-blue-50',
                  },
                  {
                    label: `${period === '7d' ? '7天' : '30天'}总调用`,
                    v: usage.totalCalls.toLocaleString(),
                    sub: `Token ${fmtTokens(usage.totalTokens)}`,
                    color: 'border-purple-200 bg-purple-50',
                  },
                  {
                    label: '总消费',
                    v: fmtCost(usage.totalCost),
                    sub: `成功率 ${usage.successRate}%`,
                    color: 'border-green-200 bg-green-50',
                  },
                  {
                    label: '平均延迟',
                    v: `${usage.avgDuration}ms`,
                    sub: today ? `今日 ${today.avgDurationMs}ms` : `${period === '7d' ? '近7天' : '近30天'}`,
                    color: 'border-amber-200 bg-amber-50',
                  },
                ] as const).map(c => (
                  <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                    <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                    <p className="text-lg font-bold text-slate-800">{c.v}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Success rate bar */}
              {usage.totalCalls > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-500">成功率</span>
                    <span className="font-mono font-bold text-slate-700">{usage.successRate}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="bg-emerald-500 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(100, usage.successRate)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>成功 {usage.successCalls}</span>
                    <span>失败 {usage.totalCalls - usage.successCalls}</span>
                  </div>
                </div>
              )}

              {/* Token breakdown detail */}
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-500 mb-2">Token 消耗明细</p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Prompt:</span>
                    <span className="font-mono font-medium text-slate-700">{fmtTokens(usage.promptTokens)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Completion:</span>
                    <span className="font-mono font-medium text-slate-700">{fmtTokens(usage.completionTokens)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">总计:</span>
                    <span className="font-mono font-bold text-slate-800">{fmtTokens(usage.totalTokens)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={() => handleExport('summary')}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                  <Download size={12} /> 导出概览
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Tab: 按模型 ── */}
      {tab === 'models' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loadingModels ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
            ) : sortedModels.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">暂无模型用量数据</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">延迟</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">成功率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedModels.map((m) => (
                    <tr key={m.modelName} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700 font-mono">{m.modelName || '未知'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{m.totalCalls.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmtCost(m.totalCost)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{m.avgDuration}ms</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono ${m.successRate < 90 ? 'text-red-600' : m.successRate < 99 ? 'text-amber-600' : 'text-slate-600'}`}>
                          {m.successRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {sortedModels.length > 0 && (
            <div className="flex justify-end">
              <button onClick={() => handleExport('models')}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                <Download size={12} /> 导出模型数据
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: 趋势 ── */}
      {tab === 'trends' && (
        <div className="space-y-4">
          {/* 7-day bar chart */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-3">
              <TrendingUp size={12} className="inline mr-1" />Token 消耗趋势
            </p>
            {loadingDaily ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : trendDays.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">暂无数据</p>
            ) : (
              <div className="flex items-end gap-2 h-28">
                {trendDays.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1"
                    title={`${d.date}: ${d.totalCalls}次 / ${fmtTokens(Number(d.totalTokens))} / ${fmtCost(d.totalCost)}`}>
                    <span className="text-[10px] text-slate-400 font-mono">{d.totalCalls}</span>
                    <div className="w-full bg-blue-400 rounded-t transition-all hover:bg-blue-500"
                      style={{ height: `${Math.max(3, (Number(d.totalTokens) / maxTrendTokens) * 100)}%`, minHeight: 3 }} />
                    <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily call intensity heatmap */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-3">
              <Clock size={12} className="inline mr-1" />每日调用热力分布
            </p>
            {loadingDaily ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin" size={16} /></div>
            ) : trendDays.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">暂无数据</p>
            ) : (() => {
              const maxCalls = Math.max(1, ...trendDays.map(d => d.totalCalls))
              return (
                <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-lg overflow-hidden">
                  {trendDays.map(d => {
                    const intensity = d.totalCalls / maxCalls
                    let bg = 'bg-slate-50'
                    if (intensity > 0.7) bg = 'bg-blue-500'
                    else if (intensity > 0.4) bg = 'bg-blue-400'
                    else if (intensity > 0.1) bg = 'bg-blue-200'
                    return (
                      <div key={d.date} className={`${bg} p-3 text-center transition-colors`}
                        title={`${d.date}: ${d.totalCalls}次 / ${fmtTokens(Number(d.totalTokens))}`}>
                        <span className="text-[10px] text-slate-600 font-mono">{d.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {trendDays.length > 0 && (
            <div className="flex justify-end">
              <button onClick={() => handleExport('daily')}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                <Download size={12} /> 导出趋势数据
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: 按Key ── */}
      {tab === 'keys' && (
        <div className="space-y-4">
          {loadingKeys ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
          ) : keys.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
              <Key size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-400">暂无 API 密钥</p>
              <p className="text-xs text-slate-400 mt-1">前往 <a href="/api-keys" className="text-blue-500 underline">API 密钥页面</a> 创建密钥后查看用量</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 text-slate-500 font-medium w-8"></th>
                    <th className="px-4 py-2.5 text-slate-500 font-medium">密钥名称</th>
                    <th className="px-4 py-2.5 text-slate-500 font-medium">前缀</th>
                    <th className="px-4 py-2.5 text-slate-500 font-medium">状态</th>
                    <th className="px-4 py-2.5 text-slate-500 font-medium">最后使用</th>
                    <th className="px-4 py-2.5 text-slate-500 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map(key => (
                    <>
                      <tr key={key.id}
                        className={`hover:bg-slate-50 cursor-pointer transition ${expandedKeyId === key.id ? 'bg-blue-50/50' : ''}`}
                        onClick={() => setExpandedKeyId(expandedKeyId === key.id ? null : key.id)}
                      >
                        <td className="px-3 py-2.5">
                          {expandedKeyId === key.id
                            ? <ChevronDown size={14} className="text-slate-400" />
                            : <ChevronRight size={14} className="text-slate-400" />
                          }
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{key.name}</td>
                        <td className="px-4 py-2.5"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono">{key.keyPrefix}...</code></td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${key.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {key.status ? '启用' : '停用'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('zh-CN') : '从未使用'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(key.createdAt).toLocaleString('zh-CN')}</td>
                      </tr>
                      {expandedKeyId === key.id && (
                        <tr key={`${key.id}-usage`}>
                          <td colSpan={6} className="px-0 py-0">
                            <KeyUsagePanel keyId={key.id} keyName={key.name} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {keys.length > 0 && (
            <div className="flex justify-end">
              <button onClick={() => handleExport('keys')}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                <Download size={12} /> 导出密钥列表
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Expanded Key Usage Panel ──

function KeyUsagePanel({ keyId, keyName }: { keyId: number; keyName: string }) {
  const [usage, setUsage] = useState<KeyUsageDeep | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'models' | 'trends' | 'compare'>('overview')

  useEffect(() => {
    setLoading(true)
    get<KeyUsageDeep>(`/api/v1/api-keys/${keyId}/usage`)
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoading(false))
  }, [keyId])

  if (loading) return (
    <div className="bg-gradient-to-b from-blue-50/30 to-white border-b-2 border-blue-100 px-6 py-4">
      <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={18} /></div>
    </div>
  )

  if (!usage) return (
    <div className="bg-gradient-to-b from-blue-50/30 to-white border-b-2 border-blue-100 px-6 py-4">
      <p className="text-xs text-slate-400 text-center py-6">暂无用量数据</p>
    </div>
  )

  return (
    <div className="bg-gradient-to-b from-blue-50/30 to-white border-b-2 border-blue-100">
      <div className="space-y-4 py-5 px-6">
        {/* Panel header */}
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{keyName} — 用量分析</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            成功率: {pct(usage.today.successCount, usage.today.calls)}
            {usage.today.calls > 0 && <> · 平均耗时: {usage.today.avgDurationMs}ms</>}
          </p>
        </div>

        {/* Sub-tab bar */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {([
            { k: 'overview' as const, label: '概览', icon: BarChart3 },
            { k: 'models' as const, label: '按模型', icon: PieChart },
            { k: 'trends' as const, label: '趋势', icon: TrendingUp },
            { k: 'compare' as const, label: 'Key对比', icon: Activity },
          ]).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {/* Sub-tab: Overview */}
        {tab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: '今日调用', v: usage.today.calls.toLocaleString(), sub: `${usage.today.successCount} 成功 / ${usage.today.failedCount} 失败`, color: 'border-blue-200 bg-blue-50' },
                { label: '今日Token', v: fmtTokens(usage.today.tokens), sub: `消耗 ${fmtCost(usage.today.cost)}`, color: 'border-purple-200 bg-purple-50' },
                { label: '本月调用', v: usage.month.calls.toLocaleString(), sub: `${fmtTokens(usage.month.tokens)} / ${fmtCost(usage.month.cost)}`, color: 'border-green-200 bg-green-50' },
                { label: '累计', v: usage.allTime.calls.toLocaleString(), sub: `¥${parseFloat(usage.allTime.cost).toFixed(2)}`, color: 'border-amber-200 bg-amber-50' },
              ] as const).map(c => (
                <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                  <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                  <p className="text-lg font-bold text-slate-800">{c.v}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {usage.today.calls > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-500">今日成功率</span>
                  <span className="font-mono font-bold text-slate-700">{pct(usage.today.successCount, usage.today.calls)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-500 h-3 rounded-full transition-all"
                    style={{ width: `${usage.today.calls > 0 ? (usage.today.successCount / usage.today.calls) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>成功 {usage.today.successCount}</span>
                  <span>失败 {usage.today.failedCount}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Model Breakdown */}
        {tab === 'models' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {usage.modelBreakdown.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">暂无数据</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2 font-medium text-slate-500">模型</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">调用</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">Token</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">费用</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">成功率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.modelBreakdown.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-700 font-mono">{m.modelName || '未知'}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{m.calls.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-slate-600 font-mono">{fmtTokens(m.tokens)}</td>
                      <td className="px-4 py-2 text-right text-slate-900 font-mono font-medium">{fmtCost(m.cost)}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`font-mono ${m.successCount + m.failedCount > 0 && m.successCount / (m.successCount + m.failedCount) < 0.9 ? 'text-red-600' : 'text-slate-600'}`}>
                          {pct(m.successCount, m.successCount + m.failedCount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Sub-tab: Trends */}
        {tab === 'trends' && (
          <div className="space-y-3">
            {/* 7-day bar chart */}
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500 mb-3">最近 7 天 Token 消耗</p>
              {usage.trends.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>
              ) : (() => {
                const max = Math.max(1, ...usage.trends.map(t => t.tokens))
                return (
                  <div className="flex items-end gap-2 h-24">
                    {usage.trends.map(t => (
                      <div key={t.date} className="flex-1 flex flex-col items-center gap-1" title={`${t.date}: ${t.calls}次 / ${fmtTokens(t.tokens)} / ${fmtCost(t.cost)}`}>
                        <span className="text-[10px] text-slate-400 font-mono">{t.calls}</span>
                        <div className="w-full bg-blue-400 rounded-t transition-all hover:bg-blue-500"
                          style={{ height: `${Math.max(3, (t.tokens / max) * 100)}%`, minHeight: 3 }} />
                        <span className="text-[10px] text-slate-400">{t.date.slice(3)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* 24h hourly heatmap */}
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500 mb-3">
                <Clock size={12} className="inline mr-1" />24 小时调用分布
              </p>
              {usage.hourlyTrends.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>
              ) : (() => {
                const maxH = Math.max(1, ...usage.hourlyTrends.map(h => h.calls))
                const hours = Array.from({ length: 24 }, (_, i) => {
                  const found = usage.hourlyTrends.find(h => h.hour === i)
                  return found || { hour: i, calls: 0, tokens: 0 }
                })
                return (
                  <div className="grid grid-cols-24 gap-px bg-slate-100 rounded-lg overflow-hidden">
                    {hours.map(h => {
                      const intensity = h.calls / Math.max(1, maxH)
                      let bg = 'bg-slate-50'
                      if (intensity > 0.7) bg = 'bg-blue-500'
                      else if (intensity > 0.4) bg = 'bg-blue-400'
                      else if (intensity > 0.1) bg = 'bg-blue-200'
                      return (
                        <div key={h.hour} className={`${bg} p-2 text-center transition-colors`}
                          title={`${h.hour}:00 - ${h.calls}次 / ${fmtTokens(h.tokens)}`}>
                          <span className="text-[9px] text-slate-600 font-mono">{h.hour}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Sub-tab: Key Compare */}
        {tab === 'compare' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {usage.allKeysSummary.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">暂无其他 Key</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2 font-medium text-slate-500">密钥</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">今日调用</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">今日 Token</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">今日费用</th>
                    <th className="px-4 py-2 font-medium text-slate-500 text-right">占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.allKeysSummary.map(k => {
                    const totalTokens = usage.allKeysSummary.reduce((a, b) => a + b.tokens, 0)
                    const isCurrent = k.keyId === keyId
                    return (
                      <tr key={k.keyId} className={`hover:bg-slate-50 ${isCurrent ? 'bg-blue-50/50 font-semibold' : ''}`}>
                        <td className="px-4 py-2 text-slate-700">
                          {k.keyName || `Key #${k.keyId}`}
                          {isCurrent && <span className="ml-1 text-[10px] text-blue-500 font-normal">(当前)</span>}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">{k.calls.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-slate-600 font-mono">{fmtTokens(k.tokens)}</td>
                        <td className="px-4 py-2 text-right text-slate-900 font-mono">{fmtCost(k.cost)}</td>
                        <td className="px-4 py-2 text-right text-slate-500 font-mono">
                          {totalTokens > 0 ? `${((k.tokens / totalTokens) * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
