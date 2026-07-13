import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AdminCostItem, AdminCostDetailResponse } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, AlertCircle, Shield, RefreshCw, ChevronDown, ChevronRight,
  DollarSign, TrendingUp, Gift, BarChart3,
} from 'lucide-react'

function fmt(v: number | null | undefined, digits = 2): string {
  const n = v ?? 0
  return `￥${(n / 100).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function pct(v: number | null | undefined): string {
  const n = v ?? 0
  return `${(n * 100).toFixed(1)}%`
}

export default function AdminCostDetail() {
  const [data, setData] = useState<AdminCostItem[]>([])
  const [summary, setSummary] = useState<AdminCostDetailResponse['summary'] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('2026-07')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<AdminCostDetailResponse>(
        '/api/v1/admin/finance/codes/cost-detail/admin',
        { period, page, pageSize, search: search || undefined }
      )
      setSummary(res.summary || null)
      setData(res.list || [])
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取 Admin 成本数据失败')
    } finally {
      setLoading(false)
    }
  }, [period, page, pageSize, search])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Shield size={28} className="text-purple-600" />
          <h1 className="text-2xl font-bold text-slate-900">Admin 成本明细</h1>
          <FeatureDescription page="admin/finance/admin-cost" className="ml-2" />
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="搜索活动名称..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={period}
            onChange={(e) => { setPeriod(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="2026-07">2026年7月</option>
            <option value="2026-06">2026年6月</option>
            <option value="2026-05">2026年5月</option>
            <option value="2026-04">2026年4月</option>
            <option value="2026-03">2026年3月</option>
            <option value="2026-02">2026年2月</option>
            <option value="2026-01">2026年1月</option>
          </select>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stat Cards */}
      {summary && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">总面值</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(summary.totalFaceValue)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                <DollarSign size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">总成本</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(summary.totalCost)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
                <TrendingUp size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">平台补贴</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(summary.totalSubsidy)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-green-50 text-green-600">
                <Gift size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">成本执行率</p>
                <p className="text-2xl font-bold text-slate-900">{pct(summary.costExecutionRate)}</p>
                <p className="text-xs text-slate-400 mt-1">{summary.campaignCount} 个活动</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                <BarChart3 size={20} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : data.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 w-8"></th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">活动名称</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">发放量</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">已使用</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">使用率</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">面值合计</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">成本</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">平台补贴</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">预算</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">预算执行率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.map((item) => {
                  const isOverBudget = item.budgetExecutionRate > 1
                  const isExpanded = expandedId === item.campaignId
                  return (
                    <>
                      <tr
                        key={item.campaignId}
                        className={`hover:bg-slate-50 transition cursor-pointer ${isOverBudget ? 'bg-red-50/50' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : item.campaignId)}
                      >
                        <td className="px-4 py-3">
                          <button className="text-slate-400 hover:text-slate-600">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.campaignName}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{item.issuedCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{item.usedCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden inline-block">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(100, item.usageRate * 100)}%` }}
                              />
                            </div>
                            <span className="text-slate-600">{pct(item.usageRate)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(item.totalFaceValue)}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{fmt(item.costAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-600">{fmt(item.subsidyAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{item.budgetAmount > 0 ? fmt(item.budgetAmount) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          {item.budgetAmount > 0 ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              isOverBudget
                                ? 'bg-red-100 text-red-700'
                                : item.budgetExecutionRate > 0.8
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-green-100 text-green-700'
                            }`}>
                              {pct(item.budgetExecutionRate)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded row: batch detail */}
                      {isExpanded && (
                        <tr key={`${item.campaignId}-batches`}>
                          <td colSpan={10} className="px-4 py-3 bg-slate-50">
                            <div className="pl-8">
                              <p className="text-xs text-slate-500 mb-2 font-medium">批次明细</p>
                              {item.batches && item.batches.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100">
                                      <th className="px-3 py-1.5 text-left font-medium text-slate-500">批次名称</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">总数/已用</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">面值</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">成本</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">补贴</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {item.batches.map((b) => (
                                      <tr key={b.batchId} className="hover:bg-white transition">
                                        <td className="px-3 py-1.5 text-slate-700">{b.batchName}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-600">{b.usedCount}/{b.count}</td>
                                        <td className="px-3 py-1.5 text-right text-green-600">{fmt(b.faceValue)}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-700">{fmt(b.costAmount)}</td>
                                        <td className="px-3 py-1.5 text-right text-green-600">{fmt(b.subsidyAmount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-xs text-slate-400 py-2">无批次明细</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 0 && (
          <PaginationBar page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={setPageSize} total={total} totalPages={totalPages} />
        )}
      </div>
    </div>
  )
}