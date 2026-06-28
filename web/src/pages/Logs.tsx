import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogItem, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react'

export default function Logs() {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    modelId: '',
    status: '',
    startDate: '',
    endDate: '',
  })

  const { filters: savedFilters, loaded: prefsLoaded, updateFilter, saveAll } = usePagePreferences('user_logs')

  // 恢复筛选条件
  useEffect(() => {
    if (prefsLoaded) {
      const restored: any = {}
      if (savedFilters.modelId) restored.modelId = savedFilters.modelId
      if (savedFilters.status) restored.status = savedFilters.status
      if (savedFilters.startDate) restored.startDate = savedFilters.startDate
      if (savedFilters.endDate) restored.endDate = savedFilters.endDate
      if (Object.keys(restored).length > 0) {
        setFilters(f => ({ ...f, ...restored }))
      }
    }
  }, [prefsLoaded])

  const totalPages = Math.ceil(total / pageSize)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (filters.modelId) params.modelId = filters.modelId
      if (filters.status) params.status = filters.status
      if (filters.startDate) params.startDate = filters.startDate
      if (filters.endDate) params.endDate = filters.endDate
      const data = await get<PaginatedData<LogItem>>('/api/v1/logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
    }
    const labels: Record<string, string> = {
      success: '成功',
      failed: '失败',
      pending: '处理中',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-700'}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">调用日志</h1>
        <span className="text-sm text-slate-500">共 {total} 条记录</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={filters.status}
              onChange={(e) => { const v = e.target.value; setFilters(f => ({ ...f, status: v })); updateFilter('status', v); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="pending">处理中</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => { const v = e.target.value; setFilters(f => ({ ...f, startDate: v })); updateFilter('startDate', v); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => { const v = e.target.value; setFilters(f => ({ ...f, endDate: v })); updateFilter('endDate', v); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => { setFilters({ modelId: '', status: '', startDate: '', endDate: '' }); saveAll({}); setPage(1) }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
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
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">Token</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">消费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">耗时</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无日志数据
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.modelName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.vendorName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.totalTokens?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">¥{Number(log.cost || 0).toFixed(6)}</td>
                    <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.durationMs}ms</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const pg = start + i
                if (pg > totalPages) return null
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`w-8 h-8 rounded text-sm ${
                      pg === page
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {pg}
                  </button>
                )
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
