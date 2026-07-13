import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogItem, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Download,
  Activity,
  Clock,
  XCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart,
} from 'recharts'

/** Admin log item — extends user-facing LogItem with user email */
interface AdminLogItem extends LogItem {
  userEmail?: string
}

/* ── Analytics types ── */

interface LogAnalyticsSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  timeoutCalls: number
  cancelledCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
  uniqueModels: number
  successRate: number
}

interface ErrorPattern {
  modelName: string
  errorMessage: string
  count: number
  lastSeen: string
}

interface TrendPoint {
  date: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
}

interface HourlyPoint {
  hour: number
  totalCalls: number
  totalTokens: number
}

interface TopConsumer {
  userId: number
  email: string
  nickname?: string
  totalCalls: number
  totalTokens: number
  totalCost: string
}

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
  { value: 'cancelled', label: '已取消' },
] as const

const ANALYTICS_TABS = [
  { key: 'overview' as const, label: '概览', icon: BarChart3 },
  { key: 'errors' as const, label: '错误分析', icon: XCircle },
  { key: 'trends' as const, label: '趋势', icon: TrendingUp },
  { key: 'users' as const, label: '用户排行', icon: Users },
]

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    timeout: 'bg-orange-100 text-orange-700',
    cancelled: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
  }
  const labels: Record<string, string> = {
    success: '成功',
    failed: '失败',
    timeout: '超时',
    cancelled: '已取消',
    pending: '处理中',
  }
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        map[status] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {labels[status] || status}
    </span>
  )
}

/* ── Helpers ── */

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(6)}`
  return `¥${n.toFixed(2)}`
}

/* ── Analytics Panel (inline) ── */

function LogAnalyticsPanel({ logs }: { logs: AdminLogItem[] }) {
  const [tab, setTab] = useState<'overview' | 'errors' | 'trends' | 'users'>('overview')
  const [deepAnalytics, setDeepAnalytics] = useState<{
    summary: LogAnalyticsSummary
    errors: ErrorPattern[]
    trends: TrendPoint[]
    hourly: HourlyPoint[]
    topConsumers: TopConsumer[]
  } | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')

  useEffect(() => {
    setLoadingAnalytics(true)
    setAnalyticsError('')
    get<{
      summary: LogAnalyticsSummary
      errors: ErrorPattern[]
      trends: TrendPoint[]
      hourly: HourlyPoint[]
      topConsumers: TopConsumer[]
    }>('/api/v1/admin/logs/analytics', { limit: 1000 })
      .then(setDeepAnalytics)
      .catch(err => setAnalyticsError(err.message || '分析数据加载失败'))
      .finally(() => setLoadingAnalytics(false))
  }, [])

  const handleExport = () => {
    const token = localStorage.getItem('accessToken')
    const a = document.createElement('a')
    a.href = `/api/v1/admin/logs/analytics/export?tab=${tab}`
    if (token) a.href += `&token=${token}`
    a.download = `logs_analytics_${tab}.csv`
    a.click()
  }

  // Client-side fallback summary from visible logs
  const clientSummary: LogAnalyticsSummary = {
    totalCalls: logs.length,
    successCalls: logs.filter(l => l.status === 'success').length,
    failedCalls: logs.filter(l => l.status === 'failed').length,
    timeoutCalls: logs.filter(l => l.status === 'timeout').length,
    cancelledCalls: logs.filter(l => l.status === 'cancelled').length,
    totalTokens: logs.reduce((sum, l) => sum + (l.totalTokens || 0), 0),
    totalCost: logs.reduce((sum, l) => sum + parseFloat(l.cost || '0'), 0).toFixed(4),
    avgDuration: logs.length > 0 ? Math.round(logs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / logs.length) : 0,
    uniqueUsers: new Set(logs.map(l => l.userEmail).filter(Boolean)).size,
    uniqueModels: new Set(logs.map(l => l.modelName).filter(Boolean)).size,
    successRate: logs.length > 0 ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 10000) / 100 : 100,
  }

  // Client-side error patterns
  const clientErrors: ErrorPattern[] = (() => {
    const errorMap = new Map<string, { count: number; modelName: string; lastSeen: string }>()
    logs.filter(l => l.status === 'failed' && l.errorMessage).forEach(l => {
      const key = l.errorMessage!
      const existing = errorMap.get(key)
      if (existing) {
        existing.count++
        if (l.createdAt > existing.lastSeen) existing.lastSeen = l.createdAt
      } else {
        errorMap.set(key, { count: 1, modelName: l.modelName || '未知', lastSeen: l.createdAt })
      }
    })
    return Array.from(errorMap.entries())
      .map(([errorMessage, rest]) => ({ errorMessage, ...rest }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  })()

  // Client-side hourly
  const clientHourly: HourlyPoint[] = (() => {
    const buckets = new Array(24).fill(0).map(() => ({ calls: 0, tokens: 0 }))
    logs.forEach(l => {
      const h = new Date(l.createdAt).getHours()
      buckets[h].calls++
      buckets[h].tokens += l.totalTokens || 0
    })
    return buckets.map((b, hour) => ({ hour, totalCalls: b.calls, totalTokens: b.tokens }))
  })()

  // Client-side daily trends
  const clientTrends: TrendPoint[] = (() => {
    const dayMap = new Map<string, { calls: number; success: number; failed: number; tokens: number; cost: number }>()
    logs.forEach(l => {
      const day = l.createdAt.slice(0, 10)
      const e = dayMap.get(day) || { calls: 0, success: 0, failed: 0, tokens: 0, cost: 0 }
      e.calls++
      if (l.status === 'success') e.success++
      else if (l.status === 'failed') e.failed++
      e.tokens += l.totalTokens || 0
      e.cost += parseFloat(l.cost || '0')
      dayMap.set(day, e)
    })
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e]) => ({ date, totalCalls: e.calls, successCalls: e.success, failedCalls: e.failed, totalTokens: e.tokens, totalCost: e.cost.toFixed(6) }))
      .slice(-7)
  })()

  // Client-side top consumers
  const clientTopConsumers: TopConsumer[] = (() => {
    const userMap = new Map<string, { calls: number; tokens: number; cost: number; email: string }>()
    logs.forEach(l => {
      const key = l.userEmail || 'anonymous'
      const e = userMap.get(key) || { calls: 0, tokens: 0, cost: 0, email: l.userEmail || '匿名' }
      e.calls++
      e.tokens += l.totalTokens || 0
      e.cost += parseFloat(l.cost || '0')
      userMap.set(key, e)
    })
    return Array.from(userMap.entries())
      .map(([key, e], i) => ({ userId: i, email: e.email, totalCalls: e.calls, totalTokens: e.tokens, totalCost: e.cost.toFixed(6) }))
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 20)
  })()

  const summary = deepAnalytics?.summary ?? clientSummary
  const errorPatterns = deepAnalytics?.errors ?? clientErrors
  const trendData = deepAnalytics?.trends ?? clientTrends
  const hourlyData = deepAnalytics?.hourly ?? clientHourly
  const topConsumers = deepAnalytics?.topConsumers ?? clientTopConsumers

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {ANALYTICS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
        >
          <Download size={12} /> 导出{tab === 'overview' ? '概览' : tab === 'errors' ? '错误' : tab === 'trends' ? '趋势' : '用户'}
        </button>
      </div>

      {analyticsError && (
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
          {analyticsError} — 使用当前页面数据展示
        </div>
      )}

      {/* ── Tab: Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 border-blue-200 bg-blue-50">
              <p className="text-xs text-slate-500 mb-1">总调用</p>
              <p className="text-lg font-bold text-slate-800">{summary.totalCalls.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                成功 {summary.successCalls} / 失败 {summary.failedCalls}
              </p>
            </div>
            <div className="rounded-lg border p-3 border-purple-200 bg-purple-50">
              <p className="text-xs text-slate-500 mb-1">Token 消耗</p>
              <p className="text-lg font-bold text-slate-800">{fmtTokens(summary.totalTokens)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{summary.totalTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3 border-green-200 bg-green-50">
              <p className="text-xs text-slate-500 mb-1">总花费</p>
              <p className="text-lg font-bold text-slate-800">{fmtCost(summary.totalCost)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                成功率 {summary.successRate}% · {summary.uniqueUsers} 用户
              </p>
            </div>
            <div className="rounded-lg border p-3 border-amber-200 bg-amber-50">
              <p className="text-xs text-slate-500 mb-1">平均延迟 / 模型</p>
              <p className="text-lg font-bold text-slate-800">{summary.avgDuration}ms</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{summary.uniqueModels} 个模型</p>
            </div>
          </div>

          {/* Status distribution mini bar */}
          {summary.totalCalls > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500 mb-2">状态分布</p>
              <div className="space-y-2">
                {[
                  { label: '成功', count: summary.successCalls, color: 'bg-emerald-500' },
                  { label: '失败', count: summary.failedCalls, color: 'bg-red-500' },
                  { label: '超时', count: summary.timeoutCalls, color: 'bg-orange-500' },
                  { label: '取消', count: summary.cancelledCalls, color: 'bg-gray-400' },
                ].filter(s => s.count > 0).map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-8 text-right">{s.label}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`${s.color} h-3 rounded-full transition-all`}
                        style={{ width: `${(s.count / summary.totalCalls) * 100}%`, minWidth: s.count > 0 ? 4 : 0 }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 w-12 text-right">{s.count.toLocaleString()}</span>
                    <span className="text-[10px] text-slate-400 w-10 text-right">
                      {((s.count / summary.totalCalls) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Error Analysis ── */}
      {tab === 'errors' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {errorPatterns.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              <AlertTriangle size={24} className="mx-auto mb-2 text-emerald-400" />
              暂无错误记录
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500">错误信息</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">次数</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500">最后出现</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {errorPatterns.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{e.modelName}</td>
                    <td className="px-4 py-2.5 text-red-600 max-w-[400px] truncate">{e.errorMessage}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600">{e.count}</td>
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                      {e.lastSeen ? new Date(e.lastSeen).toLocaleString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Trends ── */}
      {tab === 'trends' && (
        <div className="space-y-4">
          {/* 7-day chart */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-3">
              <TrendingUp size={12} className="inline mr-1 text-blue-500" />
              最近 7 天调用趋势
            </p>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Area type="monotone" dataKey="totalCalls" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} name="调用" strokeWidth={2} />
                    <Area type="monotone" dataKey="successCalls" stroke="#10B981" fill="#10B981" fillOpacity={0.1} name="成功" strokeWidth={2} />
                    <Area type="monotone" dataKey="failedCalls" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} name="失败" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Hourly heatmap */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-3">
              <Clock size={12} className="inline mr-1 text-indigo-500" />
              24 小时调用分布
            </p>
            {hourlyData.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">暂无数据</div>
            ) : (() => {
              const maxCalls = Math.max(1, ...hourlyData.map(h => h.totalCalls))
              return (
                <div className="grid gap-px bg-slate-100 rounded-lg overflow-hidden" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                  {hourlyData.map(h => {
                    const intensity = maxCalls > 0 ? h.totalCalls / maxCalls : 0
                    let bg = 'bg-slate-50'
                    if (intensity > 0.7) bg = 'bg-blue-500'
                    else if (intensity > 0.4) bg = 'bg-blue-400'
                    else if (intensity > 0.1) bg = 'bg-blue-200'
                    return (
                      <div
                        key={h.hour}
                        className={`${bg} p-2 text-center transition-colors`}
                        title={`${h.hour}:00 - ${h.totalCalls}次 / ${fmtTokens(h.totalTokens)}`}
                      >
                        <span className={intensity > 0.4 ? 'text-white text-[9px] font-mono' : 'text-[9px] text-slate-600 font-mono'}>
                          {h.hour}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Tab: Top Consumers ── */}
      {tab === 'users' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {topConsumers.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">暂无数据</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-slate-500">用户</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">花费</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topConsumers.map((u, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[200px] truncate">
                      {u.nickname || u.email || `用户 #${u.userId}`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{u.totalCalls.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(u.totalTokens)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmtCost(u.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ── */

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [keyword, setKeyword] = useState('')
  const [modelName, setModelName] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Analytics panel toggle
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (modelName) params.modelName = modelName
      if (statusFilter) params.status = statusFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const data = await get<PaginatedData<AdminLogItem>>('/api/v1/admin/logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取调用日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, modelName, statusFilter, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const resetFilters = () => {
    setKeyword('')
    setModelName('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">调用日志管理</h1>
        <FeatureDescription page="admin/logs" className="ml-2" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <button
            onClick={() => { setPage(1); fetchLogs() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════ */}
      {/*  Collapsible Analytics Panel           */}
      {/* ══════════════════════════════════════ */}

      <div className="bg-gradient-to-b from-blue-50/30 to-white rounded-2xl border border-blue-100/50 overflow-hidden">
        {/* Collapse header */}
        <button
          onClick={() => setAnalyticsOpen(!analyticsOpen)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/30 transition"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-600" />
            <span className="font-semibold text-sm text-slate-800">日志分析</span>
            <span className="text-xs text-slate-400">
              {analyticsOpen ? '— 点击收起' : '— 点击展开查看调用概览、错误分析、趋势和用户排行'}
            </span>
          </div>
          {analyticsOpen ? (
            <ChevronUp size={18} className="text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
        </button>

        {/* Collapsible content */}
        {analyticsOpen && (
          <div className="px-5 pb-5">
            <LogAnalyticsPanel logs={logs} />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          {/* User keyword search */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-500 mb-1">用户搜索</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                placeholder="搜索用户邮箱"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Model name */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">模型名称</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => { setModelName(e.target.value); setPage(1) }}
              placeholder="如 gpt-4o"
              className="w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={resetFilters}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            重置
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">提示 Token</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">补全 Token</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">总计 Token</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">消费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">耗时</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    暂无调用日志数据
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{log.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{log.userEmail || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.modelName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.vendorName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.promptTokens?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.completionTokens?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">{log.totalTokens?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">¥{Number(log.cost || 0).toFixed(6)}</td>
                    <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.durationMs}ms</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>
    </div>
  )
}
