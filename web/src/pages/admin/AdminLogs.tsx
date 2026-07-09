import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogItem, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
} from 'lucide-react'

/** Admin log item — extends user-facing LogItem with user email */
interface AdminLogItem extends LogItem {
  userEmail?: string
}

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
  { value: 'cancelled', label: '已取消' },
] as const

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
