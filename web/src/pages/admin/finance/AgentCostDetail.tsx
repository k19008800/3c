import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  TrendingUp, Search, ChevronDown, ChevronRight,
  ArrowUpDown, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react'

/* ── 本地类型定义 ── */

interface BatchItem {
  batchId: number
  batchName: string
  totalCount: number
  usedCount: number
  usageRate: number
  faceValue: string
  costAmount: string
  subsidyAmount: string
  createdAt: string
}

interface AgentCostRow {
  agentId: number
  agentName: string
  agentEmail: string
  batchCount: number
  totalFaceValue: string
  totalConsumed: number
  consumeRate: number
  costAmount: string
  subsidyAmount: string
  subsidyRate: number
  roi: number
  batches: BatchItem[]
}

interface AgentCostSummary {
  agentCount: number
  totalFaceValue: string
  totalCost: string
  totalSubsidy: string
}

interface AgentCostResponse {
  period: string
  summary: AgentCostSummary
  list: AgentCostRow[]
  total: number
  page: number
  pageSize: number
}

/* ── 工具函数 ── */

function fmt(v: string | number | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0)
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function pct(v: number | null | undefined): string {
  const n = v ?? 0
  return `${(n * 100).toFixed(1)}%`
}

/* ── 列定义 ── */

interface SortableColumn {
  key: string
  label: string
  sortable: boolean
  align: 'left' | 'right' | 'center'
}

const columns: SortableColumn[] = [
  { key: 'agentName', label: '代理名称', sortable: true, align: 'left' },
  { key: 'batchCount', label: '兑换码数量', sortable: true, align: 'right' },
  { key: 'totalFaceValue', label: '总面值', sortable: true, align: 'right' },
  { key: 'totalConsumed', label: '已消耗', sortable: true, align: 'right' },
  { key: 'consumeRate', label: '消耗率', sortable: true, align: 'right' },
  { key: 'costAmount', label: '成本金额', sortable: true, align: 'right' },
  { key: 'subsidyAmount', label: '补贴金额', sortable: true, align: 'right' },
  { key: 'subsidyRate', label: '补贴率', sortable: true, align: 'right' },
  { key: 'roi', label: 'ROI', sortable: true, align: 'right' },
]

/* ── 主组件 ── */

export default function AgentCostDetail() {
  const [data, setData] = useState<AgentCostRow[]>([])
  const [summary, setSummary] = useState<AgentCostSummary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('2026-07')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string | number | undefined> = {
        period,
        page,
        pageSize,
      }
      if (search) params.search = search
      if (sortBy) params.sortBy = sortBy
      if (sortDir) params.sortDir = sortDir

      const res = await get<AgentCostResponse>(
        '/api/v1/admin/finance/agent-cost',
        params
      )
      setSummary(res.summary || null)
      setData(res.list || [])
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取 Agent 成本数据失败')
    } finally {
      setLoading(false)
    }
  }, [period, page, pageSize, search, sortBy, sortDir])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
    setPage(1)
  }

  const renderSortIcon = (key: string) => {
    if (sortBy !== key) {
      return <ArrowUpDown size={13} className="text-slate-300 ml-1 inline" />
    }
    return (
      <span className="ml-1 text-purple-600 text-xs">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <TrendingUp size={28} className="text-purple-600" />
          <h1 className="text-2xl font-bold text-slate-900">Agent 成本明细</h1>
          <FeatureDescription page="admin/finance/agent-cost" className="ml-2" />
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索代理名称…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {/* Period selector */}
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

      {/* Summary Cards */}
      {summary && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs text-slate-500 mb-1">代理商数量</p>
            <p className="text-2xl font-bold text-slate-900">{summary.agentCount.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs text-slate-500 mb-1">总面值</p>
            <p className="text-2xl font-bold text-slate-900">{fmt(summary.totalFaceValue)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs text-slate-500 mb-1">总成本</p>
            <p className="text-2xl font-bold text-slate-900">{fmt(summary.totalCost)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-xs text-slate-500 mb-1">总补贴</p>
            <p className="text-2xl font-bold text-slate-900">{fmt(summary.totalSubsidy)}</p>
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
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-sm font-medium text-slate-500 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${col.sortable ? 'cursor-pointer hover:text-slate-700 select-none' : ''}`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      {col.label}
                      {col.sortable && renderSortIcon(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.map((row) => {
                  const isExpanded = expandedId === row.agentId
                  return (
                    <>
                      <tr
                        key={row.agentId}
                        className="hover:bg-slate-50 transition cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : row.agentId)}
                      >
                        <td className="px-4 py-3">
                          <button className="text-slate-400 hover:text-slate-600">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          <div>{row.agentName}</div>
                          {row.agentEmail && (
                            <div className="text-xs text-slate-400 font-normal">{row.agentEmail}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{row.batchCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(row.totalFaceValue)}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{row.totalConsumed.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden inline-block">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(100, row.consumeRate * 100)}%` }}
                              />
                            </div>
                            <span className="text-slate-600">{pct(row.consumeRate)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{fmt(row.costAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-600">{fmt(row.subsidyAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.subsidyRate > 0.5
                              ? 'bg-amber-100 text-amber-700'
                              : row.subsidyRate > 0.2
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-green-100 text-green-700'
                          }`}>
                            {pct(row.subsidyRate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.roi > 1
                              ? 'bg-green-100 text-green-700'
                              : row.roi > 0
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {pct(row.roi)}
                          </span>
                        </td>
                      </tr>
                      {/* Expanded row: batch details */}
                      {isExpanded && (
                        <tr key={`${row.agentId}-batches`}>
                          <td colSpan={columns.length + 1} className="px-4 py-3 bg-slate-50">
                            <div className="pl-8">
                              <p className="text-xs text-slate-500 mb-2 font-medium">批次明细</p>
                              {row.batches && row.batches.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100">
                                      <th className="px-3 py-1.5 text-left font-medium text-slate-500">批次名称</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">总数/已用</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">面值</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">成本</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">补贴</th>
                                      <th className="px-3 py-1.5 text-right font-medium text-slate-500">创建时间</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {row.batches.map((b) => (
                                      <tr key={b.batchId} className="hover:bg-white transition">
                                        <td className="px-3 py-1.5 text-slate-700">{b.batchName}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-600">
                                          {b.usedCount}/{b.totalCount}
                                          <span className="text-slate-400 ml-1">({pct(b.usageRate)})</span>
                                        </td>
                                        <td className="px-3 py-1.5 text-right text-green-600">{fmt(b.faceValue)}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-700">{fmt(b.costAmount)}</td>
                                        <td className="px-3 py-1.5 text-right text-green-600">{fmt(b.subsidyAmount)}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-400">{b.createdAt.slice(0, 10)}</td>
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
