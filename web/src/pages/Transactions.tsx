import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, Wallet,
  ArrowUpRight, ArrowDownLeft, RotateCcw, Gift, TrendingUp,
} from 'lucide-react'

// ── Types ──

interface BalanceLog {
  id: number
  userId: number
  amount: string
  balanceAfter: string
  type: string
  refType: string | null
  description: string | null
  createdAt: string
}

// ── Type config ──

type LogType =
  | 'recharge'
  | 'deduction'
  | 'refund'
  | 'commission'
  | 'redemption'
  | 'withdraw'
  | 'adjustment'

const typeConfig: Record<string, { label: string; icon: any; color: string }> = {
  recharge: { label: '充值', icon: ArrowUpRight, color: 'text-green-600 bg-green-50 border-green-200' },
  deduction: { label: '扣费', icon: ArrowDownLeft, color: 'text-red-600 bg-red-50 border-red-200' },
  refund: { label: '退款', icon: RotateCcw, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  commission: { label: '佣金', icon: TrendingUp, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  redemption: { label: '兑换', icon: Gift, color: 'text-pink-600 bg-pink-50 border-pink-200' },
  withdraw: { label: '提现', icon: ArrowDownLeft, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  adjustment: { label: '调整', icon: Wallet, color: 'text-amber-600 bg-amber-50 border-amber-200' },
}

function getTypeConfig(type: string) {
  return typeConfig[type] || { label: type, icon: Wallet, color: 'text-slate-600 bg-slate-50 border-slate-200' }
}

// ── Helpers ──

function fmtAmount(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

function fmtBalance(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function getBalanceBefore(log: BalanceLog): number {
  const after = parseFloat(log.balanceAfter)
  const amount = parseFloat(log.amount)
  return after - amount
}

// ── Filter Options ──

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: '全部' },
  ...Object.entries(typeConfig).map(([value, cfg]) => ({ value, label: cfg.label })),
]

// ── Page ──

const PAGE_SIZE_OPTIONS = [20, 50, 100]

export default function Transactions() {
  const [logs, setLogs] = useState<BalanceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [typeFilter, setTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (typeFilter) params.type = typeFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate

      const res = await get<PaginatedData<BalanceLog>>('/api/v1/balance-logs', params)
      setLogs(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取交易流水失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, typeFilter, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleReset = () => {
    setTypeFilter('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">交易流水</h1>
          {total > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{total} 条</span>
          )}
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          {/* Type filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 whitespace-nowrap">类型</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TYPE_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 whitespace-nowrap">时间</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Reset */}
          {(typeFilter || startDate || endDate) && (
            <button
              onClick={handleReset}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      )}

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Wallet size={48} className="mb-3 opacity-50" />
          <p className="text-sm">暂无交易流水</p>
        </div>
      )}

      {/* Table */}
      {!loading && logs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动金额</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动前</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500 text-right">变动后</th>
                  <th className="px-4 py-3 text-sm font-medium text-slate-500">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => {
                  const cfg = getTypeConfig(log.type)
                  const Icon = cfg.icon
                  const amount = parseFloat(log.amount)
                  const balanceBefore = getBalanceBefore(log)
                  const isNegative = amount < 0

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                          <Icon size={12} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-bold ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                        {isNegative ? '' : '+'}{fmtAmount(log.amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-500">
                        {fmtBalance(balanceBefore)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-700 font-medium">
                        {fmtBalance(log.balanceAfter)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate" title={log.description || ''}>
                        {log.description || (log.refType ? `来源: ${log.refType}` : '—')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </div>
      )}
    </div>
  )
}
