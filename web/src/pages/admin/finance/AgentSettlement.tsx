import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Loader2, AlertCircle, Search, RefreshCw,
  TrendingDown, TrendingUp, Lock, Unlock, Wallet,
} from 'lucide-react';
import FeatureDescription from '@/components/admin/FeatureDescription';

// ── Types (matches backend response) ──

interface SettlementItem {
  agentId: number
  agentName: string
  email: string
  openingBalance: number
  openingFrozen: number
  monthDeduction: number
  monthFreeze: number
  monthUnfreeze: number
  monthRefund: number
  closingBalance: number
  closingFrozen: number
}

interface SettlementSummary {
  totalAgents: number
  totalOpeningAvailable: number
  totalOpeningFrozen: number
  totalConsumption: number
  totalFrozen: number
  totalUnfreeze: number
  totalRefund: number
  totalClosingAvailable: number
  totalClosingFrozen: number
}

interface SettlementData {
  period: string
  summary: SettlementSummary
  items: SettlementItem[]
  total: number
  page: number
  pageSize: number
}

// ── Helpers ──

function fmt(n: number): string {
  return `¥${(n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtRaw(n: number, digits = 2): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

// ── Component ──

const AgentSettlement: React.FC = () => {
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('period', period)
      if (search.trim()) params.set('search', search.trim())
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(
        `/api/v1/admin/finance/codes/agent-settlement?${params.toString()}`,
      )
      if (!res.ok) throw new Error(`请求失败 (${res.status})`)
      const body = await res.json()
      if (body.code !== 0) throw new Error(body.message || '加载失败')
      setData(body.data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载结算数据失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [period, search, page, pageSize])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // Month options
  const monthOptions = (() => {
    const now = new Date()
    const opts: { value: string; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      })
    }
    return opts
  })()

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">代理结算对账</h1>
          <FeatureDescription page="admin/finance/settlement" className="ml-2" />
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => { setPeriod(e.target.value); setPage(1) }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={fetchRecords}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="搜索代理名称或邮箱…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 underline hover:no-underline">关闭</button>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500">加载中…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && !data && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <DollarSign className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">暂无结算数据</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { label: '代理数', value: data.summary.totalAgents, unit: '个', icon: Wallet, color: 'bg-blue-50 text-blue-600 border-blue-200', fmt: false },
              { label: '期初可用', value: data.summary.totalOpeningAvailable, unit: '', icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600 border-emerald-200', fmt: true },
              { label: '本月消耗', value: data.summary.totalConsumption, unit: '', icon: TrendingDown, color: 'bg-rose-50 text-rose-600 border-rose-200', fmt: true },
              { label: '期末可用', value: data.summary.totalClosingAvailable, unit: '', icon: Wallet, color: 'bg-indigo-50 text-indigo-600 border-indigo-200', fmt: true },
              { label: '期初冻结', value: data.summary.totalOpeningFrozen, unit: '', icon: Lock, color: 'bg-amber-50 text-amber-600 border-amber-200', fmt: true },
              { label: '本月冻结', value: data.summary.totalFrozen, unit: '', icon: Lock, color: 'bg-orange-50 text-orange-600 border-orange-200', fmt: true },
              { label: '本月解冻', value: data.summary.totalUnfreeze, unit: '', icon: Unlock, color: 'bg-teal-50 text-teal-600 border-teal-200', fmt: true },
              { label: '期末冻结', value: data.summary.totalClosingFrozen, unit: '', icon: Lock, color: 'bg-gray-50 text-gray-600 border-gray-200', fmt: true },
            ] as const).map(c => (
              <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
                <p className="text-xs text-current opacity-70 mb-1 flex items-center gap-1">
                  <c.icon size={12} /> {c.label}
                </p>
                <p className="text-lg font-bold text-current">
                  {c.fmt ? fmt(c.value) : `${c.value}${c.unit}`}
                </p>
              </div>
            ))}
          </div>

          {/* Agent Table */}
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['代理名称', '邮箱', '期初余额', '本月消耗', '本月冻结', '解冻返还', '本月退款', '期末余额', '冻结余额'].map(label => (
                    <th key={label} className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.items.map(item => (
                  <tr key={item.agentId} className="hover:bg-gray-50 transition">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.agentName}</td>
                    <td className="px-3 py-3 text-sm text-gray-500">{item.email}</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-900">{fmtRaw(item.openingBalance)}</td>
                    <td className="px-3 py-3 text-sm text-right text-red-600">{fmtRaw(item.monthDeduction)}</td>
                    <td className="px-3 py-3 text-sm text-right text-orange-600">{fmtRaw(item.monthFreeze)}</td>
                    <td className="px-3 py-3 text-sm text-right text-teal-600">{fmtRaw(item.monthUnfreeze)}</td>
                    <td className="px-3 py-3 text-sm text-right text-green-600">{fmtRaw(item.monthRefund)}</td>
                    <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">{fmtRaw(item.closingBalance)}</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-500">{fmtRaw(item.closingFrozen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>共 {data.total} 条记录</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                >上一页</button>
                <span className="px-3 py-1">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                >下一页</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default AgentSettlement
