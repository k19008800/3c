import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AgentCommission, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

export default function AgentCommissions() {
  const [rows, setRows] = useState<AgentCommission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { filters, loaded: prefsLoaded, updateFilter } = usePagePreferences('agent_commissions')

  // 恢复筛选条件
  useEffect(() => {
    if (prefsLoaded && filters.status) {
      setStatusFilter(filters.status)
    }
  }, [prefsLoaded])

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const res = await get<PaginatedData<AgentCommission>>('/api/v1/agent/commissions', params)
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取佣金记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-orange-100 text-orange-700',
      settled: 'bg-green-100 text-green-700',
      cancelled: 'bg-slate-100 text-slate-500',
    }
    const label: Record<string, string> = {
      pending: '待结算',
      settled: '已结算',
      cancelled: '已取消',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-slate-100 text-slate-700'}`}>
        {label[s] || s}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">分佣记录</h1>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); updateFilter('status', e.target.value || ''); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="pending">待结算</option>
              <option value="settled">已结算</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">调用成本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">佣金金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">结算时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">暂无佣金记录</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                    <td className="px-4 py-3 text-sm">¥{Number(r.callCost).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">¥{Number(r.commissionAmount).toFixed(4)}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.settledAt ? new Date(r.settledAt).toLocaleString('zh-CN') : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">第 {page} / {totalPages} 页，共 {total} 条</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronLeft size={18} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
