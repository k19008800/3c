import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogItem, LogSummary, PaginatedData, ApiKey } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import { useColumnPrefs } from '@/hooks/use-column-prefs'
import LogDetailDrawer from '@/components/logs/LogDetailDrawer'
import LogStatsCards from '@/components/logs/LogStatsCards'
import LogTrendChart from '@/components/logs/LogTrendChart'
import LogModelChart from '@/components/logs/LogModelChart'
import LogExportButton from '@/components/logs/LogExportButton'
import LogAnomaliesPanel from '@/components/logs/LogAnomaliesPanel'
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, RefreshCw,
  Search, Key, Settings2, Eye, EyeOff, ArrowUpDown, Clock, Zap,
} from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
  { value: 'cancelled', label: '已取消' },
  { value: 'pending', label: '处理中' },
] as const

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'createdAt', label: '时间' },
  { key: 'modelName', label: '模型' },
  { key: 'vendorName', label: '供应商' },
  { key: 'promptTokens', label: 'Prompt' },
  { key: 'completionTokens', label: 'Completion' },
  { key: 'totalTokens', label: 'Token' },
  { key: 'cost', label: '消费' },
  { key: 'status', label: '状态' },
  { key: 'durationMs', label: '耗时' },
  { key: 'isStreaming', label: '模式' },
  { key: 'errorMessage', label: '错误信息' },
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
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-700'}`}>
      {labels[status] || status}
    </span>
  )
}

export default function Logs() {
  // ── Data state ──
  const [logs, setLogs] = useState<LogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<LogSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])

  // ── Filters ──
  const [modelName, setModelName] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [apiKeyId, setApiKeyId] = useState<number | ''>('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // ── Saved prefs ──
  const { filters: savedFilters, loaded: prefsLoaded, updateFilter, saveAll } = usePagePreferences('user_logs')
  const { isVisible, toggleColumn } = useColumnPrefs('logs_table')

  // ── Restore saved filters ──
  useEffect(() => {
    if (!prefsLoaded) return
    const s = savedFilters
    if (s.modelName) setModelName(s.modelName)
    if (s.status) setStatusFilter(s.status)
    if (s.startDate) setStartDate(s.startDate)
    if (s.endDate) setEndDate(s.endDate)
    if (s.apiKeyId) setApiKeyId(s.apiKeyId)
    if (s.sortOrder) setSortOrder(s.sortOrder)
  }, [prefsLoaded])

  // ── Load API Keys for filter dropdown ──
  useEffect(() => {
    get<PaginatedData<ApiKey>>('/api/v1/api-keys')
      .then(d => setApiKeys(d.list || []))
      .catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / pageSize)

  // ── Fetch logs ──
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (modelName) params.modelName = modelName
      if (statusFilter) params.status = statusFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (apiKeyId !== '') params.apiKeyId = apiKeyId
      params.sortBy = 'createdAt'
      params.sortOrder = sortOrder
      const data = await get<PaginatedData<LogItem>>('/api/v1/logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, modelName, statusFilter, startDate, endDate, apiKeyId, sortOrder])

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const params: Record<string, any> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const data = await get<LogSummary>('/api/v1/logs/summary', params)
      setSummary(data)
    } catch {
      // silent
    } finally {
      setSummaryLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // ── Auto refresh ──
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchLogs()
      fetchSummary()
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs, fetchSummary])

  // ── Filter change helpers ──
  const changeFilter = (key: string, value: any, setter: (v: any) => void) => {
    setter(value)
    updateFilter(key, value)
    setPage(1)
  }

  const resetFilters = () => {
    setModelName('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
    setApiKeyId('')
    setSortOrder('desc')
    saveAll({})
    setPage(1)
  }

  // ── Column visibility panel ──
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">调用日志</h1>
        <div className="flex items-center gap-3">
          {/* Auto refresh toggle */}
          <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            自动刷新
          </label>
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <LogExportButton filters={{ modelName, status: statusFilter, startDate, endDate, apiKeyId: apiKeyId || undefined }} />
          <button
            onClick={() => { fetchLogs(); fetchSummary() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <LogStatsCards summary={summary} loading={summaryLoading} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LogTrendChart />
        <LogModelChart
          startDate={startDate || undefined}
          endDate={endDate || undefined}
        />
      </div>

      {/* Cost Anomalies Panel */}
      <LogAnomaliesPanel days={7} />

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Model name search */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">模型名称</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={modelName}
                onChange={(e) => changeFilter('modelName', e.target.value, setModelName)}
                placeholder="搜索模型..."
                className="w-40 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* API Key filter */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">API Key</label>
            <div className="relative">
              <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={apiKeyId}
                onChange={(e) => changeFilter('apiKeyId', e.target.value ? Number(e.target.value) : '', setApiKeyId)}
                className="w-44 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">全部 Key</option>
                {apiKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.keyPrefix}...)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => changeFilter('status', e.target.value, setStatusFilter)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => changeFilter('startDate', e.target.value, setStartDate)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => changeFilter('endDate', e.target.value, setEndDate)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Sort order */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">排序</label>
            <button
              onClick={() => {
                const next = sortOrder === 'desc' ? 'asc' : 'desc'
                setSortOrder(next)
                updateFilter('sortOrder', next)
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <ArrowUpDown size={14} />
              <Clock size={12} />
              时间{sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>

          {/* Column visibility */}
          <div className="relative">
            <label className="block text-xs text-slate-500 mb-1">列显隐</label>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <Eye size={14} />
              列
            </button>
            {showColumnMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 z-20 py-1">
                  {COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      {isVisible(col.key) ? (
                        <Eye size={14} className="text-blue-500" />
                      ) : (
                        <EyeOff size={14} className="text-slate-300" />
                      )}
                      {col.label}
                    </button>
                  ))}
                </div>
              </>
            )}
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
                {COLUMNS.filter(col => isVisible(col.key)).map(col => (
                  <th key={col.key} className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.filter(col => isVisible(col.key)).length} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.filter(col => isVisible(col.key)).length} className="text-center py-12 text-slate-400">
                    暂无日志数据
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => setDetailId(log.id)}
                  >
                    {isVisible('id') && <td className="px-4 py-3 text-sm text-slate-400 font-mono">{log.id}</td>}
                    {isVisible('createdAt') && (
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </td>
                    )}
                    {isVisible('modelName') && <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.modelName}</td>}
                    {isVisible('vendorName') && <td className="px-4 py-3 text-sm text-slate-600">{log.vendorName}</td>}
                    {isVisible('promptTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.promptTokens?.toLocaleString() || '-'}</td>}
                    {isVisible('completionTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.completionTokens?.toLocaleString() || '-'}</td>}
                    {isVisible('totalTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">{log.totalTokens?.toLocaleString() || '-'}</td>}
                    {isVisible('cost') && <td className="px-4 py-3 text-sm text-slate-600 text-right">¥{Number(log.cost || 0).toFixed(6)}</td>}
                    {isVisible('status') && <td className="px-4 py-3"><StatusBadge status={log.status} /></td>}
                    {isVisible('durationMs') && <td className="px-4 py-3 text-sm text-slate-600">{log.durationMs != null ? `${log.durationMs}ms` : '-'}</td>}
                    {isVisible('isStreaming') && (
                      <td className="px-4 py-3">
                        {log.isStreaming ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            <Zap size={10} />流式
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">非流式</span>
                        )}
                      </td>
                    )}
                    {isVisible('errorMessage') && (
                      <td className="px-4 py-3 text-sm text-red-500 max-w-[200px] truncate" title={log.errorMessage || ''}>
                        {log.errorMessage || '-'}
                      </td>
                    )}
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
                    className={`w-8 h-8 rounded text-sm ${pg === page ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 text-slate-600'}`}
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

      {/* Detail Drawer */}
      <LogDetailDrawer logId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
