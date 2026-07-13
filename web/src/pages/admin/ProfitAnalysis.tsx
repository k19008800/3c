import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, AlertCircle, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, Download, Globe, Layers, BarChart3, Calculator,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { post } from '@/lib/api'

// ── Types ──

interface ProfitSummary {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  marginRate: number
  revenueChange: number
  costChange: number
  profitChange: number
  marginChange: number
}

interface ProfitSummaryRow {
  modelId: number
  modelName: string
  totalCalls: number
  totalTokens: number
  totalUserCost: string
  totalCostPrice: string
  grossProfit: string
  totalCommission: string
}

interface MonthlyTrend {
  month: string
  revenue: number
  cost: number
  profit: number
}

interface ModelProfitRow {
  modelName: string
  totalCalls: number
  revenue: number
  cost: number
  profit: number
  marginRate: number
}

interface LowMarginModel {
  modelName: string
  revenue: number
  cost: number
  profit: number
  marginRate: number
  lossAmount: number
}

interface VendorStat {
  vendorName: string
  totalCalls: number
  totalTokens: number
  totalCost: string | number
  userCount?: number
}

interface ProfitData {
  summary: ProfitSummary
  trends: MonthlyTrend[]
  models: ModelProfitRow[]
  lowMarginModels: LowMarginModel[]
  total: number
}

function fmt(v: number | string | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  if (isNaN(n)) return '0.00'
  return `￥${n.toFixed(digits)}`
}

function fmtPct(v: number | null | undefined): string {
  const n = typeof v === 'number' ? v : 0
  return `${(n * 100).toFixed(1)}%`
}

function fmtNum(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseInt(v) : typeof v === 'number' ? v : 0
  return isNaN(n) ? '0' : n.toLocaleString()
}

function fmtChange(v: number | null | undefined): string {
  const n = typeof v === 'number' ? v : 0
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(1)}%`
}

// ── CSV export helper ──

function csvExport(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

// ── Status tag helper ──

function StatusTag({ value, type }: { value: string | number; type: 'profit' | 'loss' }) {
  const isPositive = typeof value === 'number' ? value >= 0 : parseFloat(String(value)) >= 0
  if (type === 'profit') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {isPositive ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
        {fmtPct(Number(value))}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {isPositive ? '+' : ''}{fmt(value)}
    </span>
  )
}

// ════════════════════════════════════════

export default function AdminProfitAnalysis() {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState<ProfitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'vendors' | 'low-margin'>('overview')

  const [detailModel, setDetailModel] = useState<string | null>(null)

  // Vendor tab state
  const [vendorStats, setVendorStats] = useState<VendorStat[]>([])
  const [vendorLoading, setVendorLoading] = useState(false)
  const [computing, setComputing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryRows, trends, models, lowMargin] = await Promise.all([
        get<ProfitSummaryRow[]>('/api/v1/admin/finance/profit/summary', { period: month, granularity: 'model' }),
        get<MonthlyTrend[]>('/api/v1/admin/finance/profit/trend', { startPeriod: '2026-01', endPeriod: month }),
        get<{ list: ModelProfitRow[]; total: number }>('/api/v1/admin/finance/profit', { period: month, page, pageSize }),
        get<LowMarginModel[]>('/api/v1/admin/finance/profit/low-margin', { period: month }),
      ])
      // Aggregate summary from per-model rows
      const totalRevenue = (summaryRows || []).reduce((acc, r) => acc + parseFloat(r.totalUserCost || '0'), 0)
      const totalCost = (summaryRows || []).reduce((acc, r) => acc + parseFloat(r.totalCostPrice || '0'), 0)
      const totalProfit = totalRevenue - totalCost
      const summary: ProfitSummary = {
        totalRevenue,
        totalCost,
        totalProfit,
        marginRate: totalRevenue > 0 ? totalProfit / totalRevenue : 0,
        revenueChange: 0,
        costChange: 0,
        profitChange: 0,
        marginChange: 0,
      }
      setData({
        summary,
        trends: trends || [],
        models: models?.list || [],
        lowMarginModels: lowMargin || [],
        total: models?.total || 0,
      })
    } catch (err: any) {
      setError(err.message || '获取利润数据失败')
    } finally {
      setLoading(false)
    }
  }, [month, page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])

  // Trigger profit computation for the selected month
  async function computeProfit() {
    setComputing(true)
    setError('')
    try {
      await post('/api/v1/admin/finance/profit/compute', { period: month })
      await fetchData()
    } catch (err: any) {
      setError(err.message || '利润计算失败')
    } finally {
      setComputing(false)
    }
  }

  // Fetch vendor stats when tab changes to vendors
  useEffect(() => {
    if (activeTab === 'vendors') {
      setVendorLoading(true)
      const [y, m] = month.split('-').map(Number)
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      const end = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      get<VendorStat[]>('/api/v1/admin/stats/by-vendor', { start, end })
        .then(setVendorStats)
        .catch(() => {})
        .finally(() => setVendorLoading(false))
    }
  }, [activeTab, month])

  // Month options for last 24 months
  const monthOptions = (() => {
    const now = new Date()
    const opts: { value: string; label: string }[] = []
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      })
    }
    return opts
  })()

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
        <button onClick={fetchData} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">重试</button>
      </div>
    )
  }

  const d = data!

  const totalPages = Math.ceil(d.total / pageSize)

  if (!d.summary && d.models.length === 0 && d.trends.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">利润分析</h1>
          <FeatureDescription page="admin/finance/profit-analysis" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{month}</span>
            <button
              onClick={computeProfit}
              disabled={computing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
            >
              <Calculator size={15} /> {computing ? '计算中...' : '首次计算利润'}
            </button>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-4 rounded-lg text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-600 font-medium mb-2">暂无利润数据</p>
          <p className="text-slate-400 text-sm mb-4">
            请点击「首次计算利润」按钮，系统将基于 call_logs 和 vendor_models 定价自动计算该月份的利润数据。
          </p>
          <p className="text-slate-400 text-xs">
            提示：利润 = Σ(sellPrice × tokens) - Σ(costPrice × tokens)，需要数据库中有该月份的调用记录和厂商定价信息。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">利润分析</h1>
        <FeatureDescription page="admin/finance/profit-analysis" className="ml-2" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">月份</span>
            <select
              value={month}
              onChange={(e) => { setMonth(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <RefreshCw size={15} /> 刷新
          </button>
          <button
            onClick={computeProfit}
            disabled={computing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            <Calculator size={15} /> {computing ? '计算中...' : '计算利润'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { k: 'overview' as const, label: '概览', icon: BarChart3 },
          { k: 'models' as const, label: '按模型', icon: Layers },
          { k: 'vendors' as const, label: '按供应商', icon: Globe },
          { k: 'low-margin' as const, label: '低利润告警', icon: AlertTriangle },
        ]).map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${activeTab === t.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: 概览 ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              {
                label: '总营收',
                v: fmt(d.summary.totalRevenue),
                sub: `${fmtChange(d.summary.revenueChange)} 环比`,
                color: 'border-blue-200 bg-blue-50',
                changeUp: d.summary.revenueChange >= 0,
              },
              {
                label: '总成本',
                v: fmt(d.summary.totalCost),
                sub: `${fmtChange(d.summary.costChange)} 环比`,
                color: 'border-amber-200 bg-amber-50',
                changeUp: d.summary.costChange >= 0,
              },
              {
                label: '总毛利',
                v: fmt(d.summary.totalProfit),
                sub: `${fmtChange(d.summary.profitChange)} 环比`,
                color: 'border-emerald-200 bg-emerald-50',
                changeUp: d.summary.profitChange >= 0,
              },
              {
                label: '综合毛利率',
                v: fmtPct(d.summary.marginRate),
                sub: `${fmtChange(d.summary.marginChange)} 环比`,
                color: 'border-purple-200 bg-purple-50',
                changeUp: d.summary.marginChange >= 0,
              },
            ] as const).map(c => (
              <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <p className="text-lg font-bold text-slate-800">{c.v}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-0.5">
                  {c.changeUp ? <TrendingUp size={10} className="text-green-600" /> : <TrendingDown size={10} className="text-red-600" />}
                  {c.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Monthly trend chart */}
          <div className="rounded-lg border border-slate-200 p-4 bg-white">
            <h2 className="text-xs font-medium text-slate-500 mb-4">月度趋势</h2>
            {d.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={d.trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="营收" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="cost" name="成本" stroke="#f59e0b" strokeWidth={2} />
                  <Line type="monotone" dataKey="profit" name="毛利" stroke="#6366f1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">暂无趋势数据</div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: 按模型 ── */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">模型利润排行</h2>
              <button
                onClick={() => {
                  const headers = ['模型名称', '总调用量', '营收', '成本', '毛利', '毛利率']
                  const rows = d.models.map(m => [
                    m.modelName,
                    String(m.totalCalls),
                    String(m.revenue),
                    String(m.cost),
                    String(m.profit),
                    fmtPct(m.marginRate),
                  ])
                  csvExport(`模型利润_${month}.csv`, headers, rows)
                }}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                <Download size={12} /> 导出CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-500">模型名称</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">总调用量</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">营收</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">成本</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">毛利</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500 text-right">毛利率</th>
                    <th className="px-4 py-2.5 font-medium text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.models.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">暂无模型利润数据</td>
                    </tr>
                  ) : (
                    d.models.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-900">{m.modelName}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtNum(m.totalCalls)}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(m.revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-orange-600">{fmt(m.cost)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmt(m.profit)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <StatusTag value={m.marginRate} type="profit" />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDetailModel(m.modelName)}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <PaginationBar
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={() => {}}
                total={d.total}
                totalPages={totalPages}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Tab: 按供应商 ── */}
      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">供应商用量统计</h2>
              <button
                onClick={() => {
                  const headers = ['供应商', '调用量', 'Token', '费用', '用户数']
                  const rows = vendorStats.map(v => [
                    v.vendorName,
                    String(v.totalCalls),
                    String(v.totalTokens),
                    typeof v.totalCost === 'number' ? v.totalCost.toFixed(2) : String(v.totalCost),
                    String(v.userCount ?? '-'),
                  ])
                  csvExport(`供应商统计_${month}.csv`, headers, rows)
                }}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                <Download size={12} /> 导出CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              {vendorLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-slate-400" size={24} />
                </div>
              ) : vendorStats.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">暂无供应商数据</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-slate-500">供应商</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用量</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">费用</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 text-right">用户数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendorStats.map((v, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-medium text-slate-900">{v.vendorName}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtNum(v.totalCalls)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtNum(v.totalTokens)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900 font-medium">{fmt(v.totalCost)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{v.userCount ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: 低利润告警 ── */}
      {activeTab === 'low-margin' && (
        <div className="space-y-4">
          {d.lowMarginModels.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              当前月份无亏损模型，经营状况良好
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 overflow-hidden bg-white">
              <div className="px-6 py-4 border-b border-red-200 bg-red-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-600" />
                  <h2 className="text-base font-semibold text-red-800">亏损模型警告</h2>
                  <span className="text-xs text-red-600">以下模型毛利率为负</span>
                </div>
                <button
                  onClick={() => {
                    const headers = ['模型名称', '营收', '成本', '亏损', '毛利率']
                    const rows = d.lowMarginModels.map(m => [
                      m.modelName,
                      String(m.revenue),
                      String(m.cost),
                      String(m.lossAmount),
                      fmtPct(m.marginRate),
                    ])
                    csvExport(`亏损模型_${month}.csv`, headers, rows)
                  }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  <Download size={12} /> 导出CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-red-50/50 text-left">
                      <th className="px-4 py-2.5 font-medium text-red-700">模型名称</th>
                      <th className="px-4 py-2.5 font-medium text-red-700 text-right">营收</th>
                      <th className="px-4 py-2.5 font-medium text-red-700 text-right">成本</th>
                      <th className="px-4 py-2.5 font-medium text-red-700 text-right">亏损</th>
                      <th className="px-4 py-2.5 font-medium text-red-700 text-right">毛利率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {d.lowMarginModels.map((m, idx) => (
                      <tr key={idx} className="hover:bg-red-50/30 transition">
                        <td className="px-4 py-3 font-medium text-red-900">{m.modelName}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(m.revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-orange-600">{fmt(m.cost)}</td>
                        <td className="px-4 py-3 text-right font-mono text-red-600 font-bold">{fmt(m.lossAmount)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            {fmtPct(m.marginRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {detailModel && (
        <ModelDetailModal
          modelName={detailModel}
          month={month}
          onClose={() => setDetailModel(null)}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════
//  Model detail modal
// ════════════════════════════════════════

function ModelDetailModal({
  modelName,
  month,
  onClose,
}: {
  modelName: string
  month: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">模型利润详情</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-700">{modelName}</p>
            <p className="text-xs text-slate-400 mt-0.5">统计月份: {month}</p>
          </div>

          <div className="text-center py-8 text-slate-400 text-sm">
            详细利润数据（每日趋势、成本构成等）将在后续版本中提供
          </div>
        </div>
      </div>
    </div>
  )
}
