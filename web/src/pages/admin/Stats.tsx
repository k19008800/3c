import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, AlertCircle, BarChart3, Activity, Cpu, Clock,
  Filter, ChevronDown, ChevronUp, Download, TrendingUp, Users,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart,
} from 'recharts'

// ──── Types ────

interface OverviewStats {
  period: string
  startDate: string
  endDate: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
  successRate: number
}

interface ModelStatItem {
  modelName: string
  displayName: string
  totalCalls: number
  successCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  successRate: number
}

interface VendorStatItem {
  vendorName: string
  totalCalls: number
  successCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueModels: number
  uniqueUsers: number
  successRate: number
}

interface HourlyItem {
  hour: number
  totalCalls: number
  successCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
}

interface TrendItem {
  date: string
  totalCalls: number
  successCalls: number
  successRate: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

interface UserStatItem {
  userId: number
  email: string
  nickname?: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  successRate: number
}

// V2.0 聚合查询类型
interface AggSeriesItem {
  timeBucket: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

interface AggSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
  uniqueModels: number
}

interface ModelBreakdownItem {
  name: string
  dimension: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

interface VendorBreakdownItem {
  name: string
  dimension: string
  totalCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
  uniqueUsers: number
}

const PERIODS = [
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: '90d', label: '近90天' },
]

const GRANULARITIES = [
  { value: 'hour', label: '按小时' },
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
]

const STATS_TABS = [
  { key: 'overview' as const, label: '概览', icon: BarChart3 },
  { key: 'models' as const, label: '按模型', icon: Cpu },
  { key: 'users' as const, label: '按用户', icon: Users },
  { key: 'trends' as const, label: '趋势', icon: TrendingUp },
]

// ──── Helpers ────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(6)}`
  if (n >= 1000) return `¥${(n / 1000).toFixed(1)}k`
  return `¥${n.toFixed(2)}`
}

// ──── Custom Tooltips ────

function TokenTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-lg p-3 text-xs">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? Number(p.value).toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-lg p-3 text-xs">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: ¥{Number(p.value).toFixed(4)}
        </p>
      ))}
    </div>
  )
}

// ──── Page ────

export default function AdminStats() {
  const [period, setPeriod] = useState('30d')
  const [tab, setTab] = useState<'overview' | 'models' | 'users' | 'trends'>('overview')

  // Independent loading states
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)

  const [modelStats, setModelStats] = useState<ModelStatItem[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  const [vendorStats, setVendorStats] = useState<VendorStatItem[]>([])
  const [loadingVendors, setLoadingVendors] = useState(true)

  const [userStats, setUserStats] = useState<UserStatItem[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  const [hourlyData, setHourlyData] = useState<HourlyItem[]>([])
  const [loadingHourly, setLoadingHourly] = useState(true)

  const [trendData, setTrendData] = useState<TrendItem[]>([])
  const [loadingTrend, setLoadingTrend] = useState(true)

  const [error, setError] = useState('')

  // ──── 聚合查询状态 ────
  const [aggOpen, setAggOpen] = useState(false)
  const [aggGranularity, setAggGranularity] = useState('day')
  const [aggModelFilter, setAggModelFilter] = useState('')
  const [aggVendorFilter, setAggVendorFilter] = useState('')
  const [aggSeries, setAggSeries] = useState<AggSeriesItem[]>([])
  const [aggSummary, setAggSummary] = useState<AggSummary | null>(null)
  const [aggModelBreakdown, setAggModelBreakdown] = useState<ModelBreakdownItem[]>([])
  const [aggVendorBreakdown, setAggVendorBreakdown] = useState<VendorBreakdownItem[]>([])
  const [aggLoading, setAggLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    setError('')
    const daysNum = period === '7d' ? 7 : period === '30d' ? 30 : 90

    setLoadingOverview(true)
    setLoadingModels(true)
    setLoadingVendors(true)
    setLoadingUsers(true)
    setLoadingHourly(true)
    setLoadingTrend(true)

    try {
      const [ov, byModel, byVendor, byUser, hourly, trend] = await Promise.all([
        get<OverviewStats>('/api/v1/admin/stats/overview', { period }),
        get<{ items: ModelStatItem[] }>('/api/v1/admin/stats/by-model', { limit: 50 }),
        get<{ items: VendorStatItem[] }>('/api/v1/admin/stats/by-vendor', { limit: 20 }),
        get<{ items: UserStatItem[] }>('/api/v1/admin/stats/by-user', { limit: 50, days: daysNum }),
        get<{ hours: HourlyItem[] }>('/api/v1/admin/stats/hourly'),
        get<{ series: TrendItem[] }>('/api/v1/admin/stats/trend', { days: daysNum }),
      ])
      setOverview(ov)
      setModelStats(byModel.items)
      setVendorStats(byVendor.items)
      setUserStats(byUser.items ?? [])
      setHourlyData(hourly.hours)
      setTrendData(trend.series)
    } catch (err: any) {
      setError(err.message || '获取统计数据失败')
    } finally {
      setLoadingOverview(false)
      setLoadingModels(false)
      setLoadingVendors(false)
      setLoadingUsers(false)
      setLoadingHourly(false)
      setLoadingTrend(false)
    }
  }, [period])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ──── 聚合查询 ────
  const fetchAggregated = useCallback(async () => {
    setAggLoading(true)
    try {
      const daysNum = period === '7d' ? 7 : period === '30d' ? 30 : 90
      const now = new Date()
      const start = new Date(now.getTime() - daysNum * 86400000).toISOString()
      const end = now.toISOString()
      const params: Record<string, any> = { start, end, granularity: aggGranularity }
      if (aggModelFilter) params.model_name = aggModelFilter
      if (aggVendorFilter) params.vendor_name = aggVendorFilter

      const data = await get<{
        series: AggSeriesItem[]
        summary: AggSummary
        modelBreakdown: ModelBreakdownItem[]
        vendorBreakdown: VendorBreakdownItem[]
      }>('/api/v1/admin/stats/usage/summary', params)

      setAggSeries(data.series)
      setAggSummary(data.summary)
      setAggModelBreakdown(data.modelBreakdown ?? [])
      setAggVendorBreakdown(data.vendorBreakdown ?? [])
    } catch (err: any) {
      console.error('聚合查询失败:', err)
    } finally {
      setAggLoading(false)
    }
  }, [period, aggGranularity, aggModelFilter, aggVendorFilter])

  useEffect(() => {
    if (aggOpen) fetchAggregated()
  }, [aggOpen, fetchAggregated])

  // ──── Export ────
  const handleExport = (exportPeriod: string, dataType: string) => {
    const token = localStorage.getItem('accessToken')
    const a = document.createElement('a')
    a.href = `/api/v1/admin/stats/export?period=${exportPeriod}&type=${dataType}`
    if (token) a.href += `&token=${token}`
    a.download = `stats_${dataType}_${exportPeriod}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">聚合统计</h1>
          <FeatureDescription page="admin/stats" className="ml-2" />
        </div>

        {/* Period selector */}
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

      {/* ══════════════════════════════════════ */}
      {/*  Tabbed Analytics Panel                */}
      {/* ══════════════════════════════════════ */}

      <div className="bg-gradient-to-b from-blue-50/30 to-white rounded-2xl border border-blue-100/50 p-5 space-y-4">

        {/* Tab bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {STATS_TABS.map(t => (
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
            onClick={() => handleExport(period, tab)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            <Download size={12} /> 导出{tab === 'overview' ? '概览' : tab === 'models' ? '模型' : tab === 'users' ? '用户' : '趋势'}
          </button>
        </div>

        {/* ── Tab: Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Colored stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {loadingOverview ? (
                <div className="col-span-5 flex justify-center py-8">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : overview ? (
                <>
                  <div className="rounded-lg border p-3 border-blue-200 bg-blue-50">
                    <p className="text-xs text-slate-500 mb-1">总调用次数</p>
                    <p className="text-lg font-bold text-slate-800">{overview.totalCalls.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">成功 {overview.successCalls} / 失败 {overview.failedCalls}</p>
                  </div>
                  <div className="rounded-lg border p-3 border-purple-200 bg-purple-50">
                    <p className="text-xs text-slate-500 mb-1">总 Token 消耗</p>
                    <p className="text-lg font-bold text-slate-800">{fmtTokens(overview.totalTokens)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{overview.totalTokens.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border p-3 border-green-200 bg-green-50">
                    <p className="text-xs text-slate-500 mb-1">总花费</p>
                    <p className="text-lg font-bold text-slate-800">{fmtCost(overview.totalCost)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">成功率 {overview.successRate}%</p>
                  </div>
                  <div className="rounded-lg border p-3 border-amber-200 bg-amber-50">
                    <p className="text-xs text-slate-500 mb-1">活跃用户</p>
                    <p className="text-lg font-bold text-slate-800">{overview.uniqueUsers.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{overview.period}</p>
                  </div>
                  <div className="rounded-lg border p-3 border-cyan-200 bg-cyan-50">
                    <p className="text-xs text-slate-500 mb-1">平均延迟</p>
                    <p className="text-lg font-bold text-slate-800">{overview.avgDuration}ms</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">总调用 {overview.totalCalls}</p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Overview trend chart */}
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity size={14} className="text-blue-500" />
                  调用趋势（{period === '7d' ? '7天' : period === '30d' ? '30天' : '90天'}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTrend ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
                ) : trendData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis yAxisId="tokens" tick={{ fontSize: 11 }} tickLine={false}
                          tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                        <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 11 }} tickLine={false}
                          tickFormatter={(v) => `¥${v}`} />
                        <Tooltip />
                        <Area yAxisId="tokens" type="monotone" dataKey="totalTokens" stroke="#8B5CF6"
                          fill="url(#colorTokens)" name="Token" strokeWidth={2} />
                        <Area yAxisId="cost" type="monotone" dataKey="totalCost" stroke="#10B981"
                          fill="url(#colorCost)" name="花费" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-slate-400">暂无趋势数据</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Tab: Models ── */}
        {tab === 'models' && (
          <div className="space-y-4">
            {/* Model breakdown table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {loadingModels ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
              ) : modelStats.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">暂无数据</div>
              ) : (
                <>
                  {/* Top models bar chart */}
                  <div className="p-4">
                    <h4 className="text-xs font-medium text-slate-500 mb-3">
                      <Cpu size={12} className="inline mr-1 text-purple-500" />模型 Token 排行 (Top 10)
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modelStats.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis type="number" tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                          <YAxis type="category" dataKey="displayName" tick={{ fontSize: 10 }} width={90} />
                          <Tooltip content={<TokenTooltip />} />
                          <Bar dataKey="totalTokens" fill="#8B5CF6" name="Token" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="px-4 pb-4">
                    <h4 className="text-xs font-medium text-slate-500 mb-2">全部模型明细</h4>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-3 py-2 font-medium text-slate-500">模型</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">调用</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">Token</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">花费</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">成功率</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">平均延迟</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {modelStats.sort((a, b) => b.totalTokens - a.totalTokens).map((m, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-700">{m.displayName || m.modelName || '未知'}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{m.totalCalls.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
                            <td className="px-3 py-2 text-right text-slate-900 font-mono font-medium">{fmtCost(m.totalCost)}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-mono ${m.successRate < 90 ? 'text-red-600' : 'text-slate-600'}`}>{m.successRate}%</span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">{m.avgDuration}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Users ── */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {loadingUsers ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
              ) : userStats.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">暂无用户排行数据</div>
              ) : (
                <>
                  {/* Top users bar chart */}
                  <div className="p-4">
                    <h4 className="text-xs font-medium text-slate-500 mb-3">
                      <Users size={12} className="inline mr-1 text-blue-500" />Token 消费排行 (Top 10)
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={userStats.slice(0, 10)} layout="vertical" margin={{ left: 120 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis type="number" tick={{ fontSize: 11 }}
                            tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                          <YAxis type="category" dataKey="email" tick={{ fontSize: 10 }} width={110} />
                          <Tooltip content={<TokenTooltip />} />
                          <Bar dataKey="totalTokens" fill="#3B82F6" name="Token" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="px-4 pb-4">
                    <h4 className="text-xs font-medium text-slate-500 mb-2">全部用户明细</h4>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-3 py-2 font-medium text-slate-500">用户</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">调用</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">Token</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">花费</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">成功率</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">平均延迟</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {userStats.sort((a, b) => b.totalTokens - a.totalTokens).map((u, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-700 max-w-[160px] truncate">{u.nickname || u.email || `用户 #${u.userId}`}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{u.totalCalls.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-600 font-mono">{fmtTokens(u.totalTokens)}</td>
                            <td className="px-3 py-2 text-right text-slate-900 font-mono font-medium">{fmtCost(u.totalCost)}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-mono ${u.successRate < 90 ? 'text-red-600' : 'text-slate-600'}`}>{u.successRate}%</span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">{u.avgDuration}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Trends ── */}
        {tab === 'trends' && (
          <div className="space-y-4">
            {/* 7-day area chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-medium text-slate-500 mb-3">
                <TrendingUp size={12} className="inline mr-1 text-blue-500" />
                最近 7 天趋势
              </h4>
              {trendData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-sm text-slate-400">暂无趋势数据</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData.slice(-7)}>
                      <defs>
                        <linearGradient id="colorTrendTokens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorTrendCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis yAxisId="tokens" tick={{ fontSize: 11 }} tickLine={false}
                        tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                      <YAxis yAxisId="calls" orientation="right" tick={{ fontSize: 11 }} tickLine={false} />
                      <Tooltip />
                      <Area yAxisId="tokens" type="monotone" dataKey="totalTokens" stroke="#8B5CF6"
                        fill="url(#colorTrendTokens)" name="Token" strokeWidth={2} />
                      <Area yAxisId="calls" type="monotone" dataKey="totalCalls" stroke="#3B82F6"
                        fill="url(#colorTrendCalls)" name="调用次数" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 24-hour heatmap */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-medium text-slate-500 mb-3">
                <Clock size={12} className="inline mr-1 text-indigo-500" />
                24 小时调用分布（今日）
              </h4>
              {hourlyData.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">暂无数据</div>
              ) : (() => {
                const maxCalls = Math.max(1, ...hourlyData.map(h => h.totalCalls))
                const hours = Array.from({ length: 24 }, (_, i) => {
                  const found = hourlyData.find(h => h.hour === i)
                  return found || { hour: i, totalCalls: 0, totalTokens: 0, successCalls: 0, totalCost: '0', avgDuration: 0 }
                })
                return (
                  <div className="grid gap-px bg-slate-100 rounded-lg overflow-hidden" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                    {hours.map(h => {
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

            {/* Hourly line chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-medium text-slate-500 mb-3">
                <Activity size={12} className="inline mr-1 text-indigo-500" />
                按小时调用趋势
              </h4>
              {hourlyData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }}
                        tickFormatter={(h) => `${h}:00`} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false}
                        tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                      <Tooltip content={<TokenTooltip />} />
                      <Line type="monotone" dataKey="totalCalls" stroke="#6366F1" strokeWidth={2}
                        dot={false} name="调用次数" />
                      <Line type="monotone" dataKey="totalTokens" stroke="#8B5CF6" strokeWidth={2}
                        dot={false} name="Token" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Vendor breakdown ── */}
      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity size={16} className="text-green-500" />
              按供应商统计排行
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingVendors ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : vendorStats.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vendorStats.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `¥${v}`} />
                    <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 10 }} width={70} />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Bar dataKey="totalCost" fill="#10B981" name="花费" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">暂无数据</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════ */}
      {/*  V2.0 聚合查询（管理后台增强）       */}
      {/* ══════════════════════════════════════ */}

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setAggOpen(!aggOpen)}>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Filter size={16} className="text-indigo-500" />
              聚合查询
              <span className="text-xs text-slate-400 font-normal">多维度聚合 + 模型/供应商细分</span>
            </span>
            {aggOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </CardTitle>
        </CardHeader>

        {aggOpen && (
          <CardContent className="border-t border-slate-100 pt-4">
            {/* 筛选器 */}
            <div className="flex flex-wrap gap-3 mb-4 items-end">
              <div>
                <label className="text-xs text-slate-500 block mb-1">聚合粒度</label>
                <select
                  value={aggGranularity}
                  onChange={(e) => setAggGranularity(e.target.value)}
                  className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white"
                >
                  {GRANULARITIES.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">模型筛选</label>
                <input
                  type="text"
                  placeholder="留空全部"
                  value={aggModelFilter}
                  onChange={(e) => setAggModelFilter(e.target.value)}
                  className="border border-slate-200 rounded-md px-3 py-1.5 text-sm w-36"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">供应商筛选</label>
                <input
                  type="text"
                  placeholder="留空全部"
                  value={aggVendorFilter}
                  onChange={(e) => setAggVendorFilter(e.target.value)}
                  className="border border-slate-200 rounded-md px-3 py-1.5 text-sm w-36"
                />
              </div>
              <button
                onClick={fetchAggregated}
                className="bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-md hover:bg-indigo-600"
              >
                查询
              </button>
            </div>

            {/* 汇总卡片 */}
            {aggSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <div className="text-lg font-bold text-slate-800">{aggSummary.totalCalls.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">总调用</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <div className="text-lg font-bold text-purple-700">{Number(aggSummary.totalTokens).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">总 Token</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <div className="text-lg font-bold text-green-700">¥{Number(aggSummary.totalCost).toFixed(4)}</div>
                  <div className="text-[10px] text-slate-500">总花费</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <div className="text-lg font-bold text-orange-700">{aggSummary.avgDuration}ms</div>
                  <div className="text-[10px] text-slate-500">平均延迟</div>
                </div>
              </div>
            )}

            {/* 聚合时间序列 */}
            {aggLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : aggSeries.length > 0 ? (
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aggSeries}>
                    <defs>
                      <linearGradient id="colorAggTokens2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="timeBucket" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false}
                      tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                    <Tooltip />
                    <Area type="monotone" dataKey="totalTokens" stroke="#6366F1"
                      fill="url(#colorAggTokens2)" name="Token" strokeWidth={2} />
                    <Area type="monotone" dataKey="totalCalls" stroke="#3B82F6"
                      fill="none" name="调用次数" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {/* 维度细分图表 */}
            {!aggLoading && (aggModelBreakdown.length > 0 || aggVendorBreakdown.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">按模型细分</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={aggModelBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 10 }}
                          tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                        <Tooltip />
                        <Bar dataKey="totalTokens" fill="#8B5CF6" name="Token" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">按供应商细分</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={aggVendorBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `¥${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} />
                        <Tooltip />
                        <Bar dataKey="totalCost" fill="#10B981" name="花费" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* 明细列表 */}
            {!aggLoading && aggSeries.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-2">时间序列明细</h4>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-left">
                        <th className="px-3 py-1.5 font-medium text-slate-500">时间</th>
                        <th className="px-3 py-1.5 font-medium text-slate-500 text-right">调用</th>
                        <th className="px-3 py-1.5 font-medium text-slate-500 text-right">Token</th>
                        <th className="px-3 py-1.5 font-medium text-slate-500 text-right">花费</th>
                        <th className="px-3 py-1.5 font-medium text-slate-500 text-right">延迟</th>
                        <th className="px-3 py-1.5 font-medium text-slate-500 text-right">用户</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {aggSeries.map((s, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap font-mono">{s.timeBucket.slice(0, 16)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{s.totalCalls.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{Number(s.totalTokens).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">¥{Number(s.totalCost).toFixed(4)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{s.avgDuration}ms</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{s.uniqueUsers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
