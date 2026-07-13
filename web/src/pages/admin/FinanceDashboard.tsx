import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { FinanceDashboard, TopConsumersData } from '@/types'
import {
  Loader2, AlertCircle, DollarSign, Users, RefreshCw,
  ClipboardList, ShieldCheck, TrendingUp,
  BarChart3, PieChart, Activity, Download,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts'

// ── Types ──

interface StatsOverview {
  period: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: number
  avgDuration: number
  uniqueUsers: number
  successRate: number
}

interface StatsTrend {
  days: number
  series: Array<{
    date: string
    totalCalls: number
    successCalls: number
    successRate: number
    totalTokens: number
    totalCost: number
    avgDuration: number
    uniqueUsers: number
  }>
}

interface ModelStats {
  modelName: string
  totalCalls: number
  totalTokens: number
  totalCost: number
  uniqueUsers: number
}

// ── Helpers ──

function fmt(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return `¥${n.toFixed(digits)}`
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return '0'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`
  return v.toLocaleString()
}

function fmtMs(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`
  return `${Math.round(v)}ms`
}

function fmtTokens(n: number | null | undefined): string {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function exportCSV(headers: string[], rows: string[][], filename: string) {
  const BOM = '﻿'
  const csv = BOM + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Component ──

type TabKey = 'overview' | 'trends' | 'categories' | 'ranking'

export default function AdminFinanceDashboard() {
  const [data, setData] = useState<FinanceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabKey>('overview')
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d')

  // Sub-data states
  const [overview, setOverview] = useState<StatsOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [trend, setTrend] = useState<StatsTrend | null>(null)
  const [byModel, setByModel] = useState<ModelStats[] | null>(null)
  const [topData, setTopData] = useState<TopConsumersData | null>(null)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<FinanceDashboard>('/api/v1/admin/finance/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || '获取财务数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOverview = useCallback(async (p: string) => {
    setOverviewLoading(true)
    try {
      const res = await get<StatsOverview>(`/api/v1/admin/stats/overview?period=${p}`)
      setOverview(res)
    } catch {
      // Silently fail for sub-data
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    await fetchDashboard()
    fetchOverview(period)
    // Fire-and-forget parallel fetches for other sub-data
    get<StatsTrend>('/api/v1/admin/stats/trend?days=30')
      .then(setTrend)
      .catch(() => {})
    get<ModelStats[]>('/api/v1/admin/stats/by-model?limit=10')
      .then(setByModel)
      .catch(() => {})
    get<TopConsumersData>('/api/v1/admin/dashboard/top-consumers')
      .then(setTopData)
      .catch(() => {})
  }, [fetchDashboard, fetchOverview, period])

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePeriodChange = (p: '7d' | '30d' | '90d') => {
    setPeriod(p)
    fetchOverview(p)
  }

  const handleRefresh = () => {
    fetchAll()
  }

  // ── Loading ──

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
        <AlertCircle size={18} />
        {error}
        <button onClick={handleRefresh} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">重试</button>
      </div>
    )
  }

  const d = data!

  const totalPendingCount = d.pendingFirstReview.count + d.pendingSecondReview.count + d.pendingRecharge.count
  const totalPendingAmount =
    parseFloat(d.pendingFirstReview.totalAmount) +
    parseFloat(d.pendingSecondReview.totalAmount) +
    parseFloat(d.pendingRecharge.totalAmount)

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">财务工作台</h1>
        <div className="flex items-center gap-2">
          <FeatureDescription page="admin/finance/dashboard" className="ml-2" />
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { k: 'overview' as TabKey, label: '概览', icon: BarChart3 },
          { k: 'trends' as TabKey, label: '趋势', icon: Activity },
          { k: 'categories' as TabKey, label: '分类', icon: PieChart },
          { k: 'ranking' as TabKey, label: '排行', icon: TrendingUp },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: 概览 ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Period selector */}
          <div className="flex items-center gap-1">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => handlePeriodChange(p)}
                className={`px-3 py-1 text-xs rounded-md transition ${period === p ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                {p === '7d' ? '7天' : p === '30d' ? '30天' : '90天'}
              </button>
            ))}
          </div>

          {/* Stat cards from overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {overviewLoading && !overview ? (
              <div className="col-span-2 md:col-span-4 flex justify-center py-4">
                <Loader2 className="animate-spin text-slate-300" size={20} />
              </div>
            ) : overview ? ([
              { label: '平台收入', v: fmt(overview.totalCost), sub: `成功率 ${(overview.successRate * 100).toFixed(1)}%`, color: 'border-blue-200 bg-blue-50' },
              { label: '总调用', v: fmtNum(overview.totalCalls), sub: `${fmtNum(overview.successCalls)} 成功 / ${fmtNum(overview.failedCalls)} 失败`, color: 'border-emerald-200 bg-emerald-50' },
              { label: '活跃用户', v: fmtNum(overview.uniqueUsers), sub: `Token ${fmtTokens(overview.totalTokens)}`, color: 'border-amber-200 bg-amber-50' },
              { label: '平均耗时', v: fmtMs(overview.avgDuration), sub: period === '7d' ? '近7天' : period === '30d' ? '近30天' : '近90天', color: 'border-purple-200 bg-purple-50' },
            ] as const).map(c => (
              <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <p className="text-lg font-bold text-slate-800">{c.v}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
              </div>
            )) : (
              <div className="col-span-2 md:col-span-4 text-center text-sm text-slate-400 py-4">暂无平台统计数据</div>
            )}
          </div>

          {/* Pending work cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '待初审提现', v: `${d.pendingFirstReview.count} 笔`, sub: fmt(d.pendingFirstReview.totalAmount), icon: ClipboardList, color: 'border-amber-200 bg-amber-50' },
              { label: '待复审提现', v: `${d.pendingSecondReview.count} 笔`, sub: fmt(d.pendingSecondReview.totalAmount), icon: ShieldCheck, color: 'border-blue-200 bg-blue-50' },
              { label: '待处理充值', v: `${d.pendingRecharge.count} 笔`, sub: fmt(d.pendingRecharge.totalAmount), icon: DollarSign, color: 'border-purple-200 bg-purple-50' },
              ...(d.pendingCommissions ? [{
                label: '待结算佣金', v: `${d.pendingCommissions.count} 笔`, sub: fmt(d.pendingCommissions.totalAmount), icon: DollarSign, color: 'border-purple-200 bg-purple-50',
              }] : []),
              { label: '今日已打款', v: `${d.todayPaidWithdraws.count} 笔`, sub: fmt(d.todayPaidWithdraws.totalAmount), icon: TrendingUp, color: 'border-emerald-200 bg-emerald-50' },
            ].map(c => (
              <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                    <p className="text-lg font-bold text-slate-800">{c.v}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
                  </div>
                  <div className={`p-1.5 rounded-md ${c.color}`}>
                    <c.icon size={16} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-orange-600" />
                <h2 className="text-base font-semibold text-slate-800">待处理汇总</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">待处理笔数</p>
                  <p className="text-2xl font-bold text-orange-600">{totalPendingCount}</p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">待处理金额</p>
                  <p className="text-lg font-bold text-orange-600">{fmt(totalPendingAmount)}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">今日已打款</p>
                  <p className="text-lg font-bold text-blue-600">{fmt(d.todayPaidWithdraws.totalAmount)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-blue-600" />
                <h2 className="text-base font-semibold text-slate-800">快速入口</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a href="/admin/recharge-orders" className="bg-blue-50 hover:bg-blue-100 rounded-lg p-4 text-center transition">
                  <p className="text-sm font-medium text-blue-700">充值订单</p>
                </a>
                <a href="/admin/finance/commissions" className="bg-violet-50 hover:bg-violet-100 rounded-lg p-4 text-center transition">
                  <p className="text-sm font-medium text-violet-700">佣金流水</p>
                </a>
                <a href="/admin/finance/reconciliation" className="bg-emerald-50 hover:bg-emerald-100 rounded-lg p-4 text-center transition">
                  <p className="text-sm font-medium text-emerald-700">对账报表</p>
                </a>
                <a href="/admin/withdraws" className="bg-rose-50 hover:bg-rose-100 rounded-lg p-4 text-center transition">
                  <p className="text-sm font-medium text-rose-700">提现管理</p>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: 趋势 ── */}
      {tab === 'trends' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">30天趋势</p>
            <button onClick={() => {
              if (!trend) return
              const headers = ['日期', '调用次数', '成功次数', '成功率', 'Token', '费用', '平均耗时(ms)', '活跃用户']
              const rows = trend.series.map(s => [
                s.date,
                String(s.totalCalls),
                String(s.successCalls),
                `${(s.successRate * 100).toFixed(1)}%`,
                String(s.totalTokens),
                String(typeof s.totalCost === 'number' ? s.totalCost.toFixed(4) : s.totalCost),
                String(s.avgDuration),
                String(s.uniqueUsers),
              ])
              exportCSV(headers, rows, '趋势数据_30天.csv')
            }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              <Download size={12} /> 导出CSV
            </button>
          </div>

          {!trend ? (
            <div className="flex justify-center py-8 text-sm text-slate-400">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : (
            <div className="space-y-5">
              {/* 30-day cost line chart */}
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 mb-3">30天费用趋势</p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trend.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `¥${v}`} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(value: any) => [`¥${Number(value).toFixed(4)}`, '费用']}
                      labelFormatter={label => `日期: ${label}`}
                    />
                    <Line type="monotone" dataKey="totalCost" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 7-day calls bar chart */}
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 mb-3">最近7天调用量</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend.series.slice(-7)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => fmtNum(v)} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(value: any) => [Number(value).toLocaleString(), '调用次数']}
                      labelFormatter={label => `日期: ${label}`}
                    />
                    <Bar dataKey="totalCalls" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: 分类 ── */}
      {tab === 'categories' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">模型分类统计</p>
            <button onClick={() => {
              if (!byModel) return
              const headers = ['模型名称', '调用次数', 'Token数', '费用', '活跃用户']
              const rows = byModel.map(m => [
                m.modelName,
                String(m.totalCalls),
                String(m.totalTokens),
                String(typeof m.totalCost === 'number' ? m.totalCost.toFixed(4) : m.totalCost),
                String(m.uniqueUsers),
              ])
              exportCSV(headers, rows, '模型分类统计.csv')
            }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              <Download size={12} /> 导出CSV
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {!byModel ? (
              <div className="flex justify-center py-8 text-sm text-slate-400">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : byModel.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">暂无数据</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500">模型名称</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用次数</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">活跃用户</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byModel.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700 font-mono">{m.modelName || '未知'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{m.totalCalls.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmt(m.totalCost, 4)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{m.uniqueUsers.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: 排行 ── */}
      {tab === 'ranking' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">用量排行</p>
            <button onClick={() => {
              if (!topData) return
              const headers = ['排名', '用户', '类型', '累计消费', '本月消费', '调用次数', '余额']
              const rows = topData.topConsumers.map((c, i) => [
                String(i + 1),
                c.nickname || c.email,
                c.userType,
                String(c.totalConsumption),
                String(c.monthConsumption),
                String(c.totalCalls),
                String(c.balance),
              ])
              exportCSV(headers, rows, '用量排行.csv')
            }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              <Download size={12} /> 导出CSV
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {!topData ? (
              <div className="flex justify-center py-8 text-sm text-slate-400">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : topData.topConsumers.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">暂无数据</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500">排名</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500">用户</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500">类型</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">累计消费</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">本月消费</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用次数</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">余额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topData.topConsumers.map((c, i) => {
                    const typeBadge = (ut: string) => {
                      const map: Record<string, { label: string; cls: string }> = {
                        agent: { label: '代理商', cls: 'bg-purple-100 text-purple-700' },
                        admin: { label: '管理员', cls: 'bg-blue-100 text-blue-700' },
                        user: { label: '用户', cls: 'bg-slate-100 text-slate-600' },
                      }
                      const m = map[ut] || { label: ut, cls: 'bg-slate-100 text-slate-600' }
                      return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.cls}`}>{m.label}</span>
                    }
                    return (
                      <tr key={c.userId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-500">#{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">{c.nickname || c.email}</td>
                        <td className="px-4 py-2.5">{typeBadge(c.userType)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmt(c.totalConsumption)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmt(c.monthConsumption)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{c.totalCalls.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmt(c.balance)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
