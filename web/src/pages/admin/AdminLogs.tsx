import { useState, useCallback, useEffect, useMemo } from 'react'
import { get } from '@/lib/api'
import type { PaginatedData } from '@/types'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import LogExportButton from '@/components/logs/LogExportButton'
import LogModelChart from '@/components/logs/LogModelChart'
import LogAnomaliesPanel from '@/components/logs/LogAnomaliesPanel'
import { BarChart3, ChevronDown, ChevronUp, Download, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react'
import type { AdminLogItem } from './admin-logs/types'
import LogStatsCards from './admin-logs/LogStatsCards'
import LogList from './admin-logs/LogList'
import LogDetail from './admin-logs/LogDetail'
import LogFilters from './admin-logs/LogFilters'
import LogAnalyticsPanel from './admin-logs/LogAnalyticsPanel'

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null)

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-logs',
    defaults: { keyword: '', modelName: '', status: '', startDate: '', endDate: '', page: 1, pageSize: 20 },
  })

  const { keyword, modelName, status: statusFilter, startDate, endDate, page, pageSize } = filters as Record<string, any>
  const totalPages = Math.ceil(total / pageSize)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
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

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const statsSummary = useMemo(() => {
    if (logs.length === 0) return null
    const sc = logs.filter(l => l.status === 'success').length
    const fc = logs.filter(l => l.status === 'failed').length
    const tt = logs.reduce((s, l) => s + (l.totalTokens || 0), 0)
    const tc = logs.reduce((s, l) => s + parseFloat(l.cost || '0'), 0)
    return {
      totalCalls: logs.length, successCalls: sc, failedCalls: fc,
      totalTokens: tt, totalCost: tc,
      avgDuration: logs.length > 0 ? Math.round(logs.reduce((s, l) => s + (l.durationMs || 0), 0) / logs.length) : 0,
      successRate: logs.length > 0 ? Math.round((sc / logs.length) * 10_000) / 100 : 100,
    }
  }, [logs])

  const exportLogsCSV = () => {
    if (logs.length === 0) return
    const headers = ['ID', '用户', '模型', '供应商', '提示Token', '补全Token', '总计Token', '消费', '状态', '耗时', '时间']
    const rows = logs.map(l => [l.id, l.userEmail || '', l.modelName, l.vendorName || '',
      l.promptTokens ?? '', l.completionTokens ?? '', l.totalTokens ?? '',
      l.cost || '', l.status, l.durationMs || '', l.createdAt,
    ])
    const bom = '\uFEFF'
    const csv = bom + headers.join(',') + '\n' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `admin_logs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">调用日志管理</h1>
        <FeatureDescription page="admin/logs" className="ml-2" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <LogExportButton filters={{ keyword, modelName, status: statusFilter, startDate, endDate }} />
          <button onClick={exportLogsCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
            <Download size={14} /> 导出 CSV
          </button>
          <button onClick={() => { setFilter('page', 1); fetchLogs() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>

      {/* Stats Cards + MiniChart */}
      <LogStatsCards summary={statsSummary} loading={loading} />

      {/* Collapsible Analytics Panel */}
      <div className="bg-gradient-to-b from-blue-50/30 to-white rounded-2xl border border-blue-100/50 overflow-hidden">
        <button onClick={() => setAnalyticsOpen(!analyticsOpen)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/30 transition">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-600" />
            <span className="font-semibold text-sm text-slate-800">日志分析</span>
            <span className="text-xs text-slate-400">
              {analyticsOpen ? '— 点击收起' : '— 点击展开查看调用概览、错误分析、趋势和用户排行'}
            </span>
          </div>
          {analyticsOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>
        {analyticsOpen && <div className="px-5 pb-5"><LogAnalyticsPanel logs={logs} /></div>}
      </div>

      {/* Model Usage Top 10 */}
      <div className="bg-gradient-to-b from-indigo-50/30 to-white rounded-2xl border border-indigo-100/50 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-2">
          <BarChart3 size={18} className="text-indigo-600" />
          <span className="font-semibold text-sm text-slate-800">模型用量 Top 10</span>
        </div>
        <div className="px-5 pb-5"><LogModelChart startDate={startDate || undefined} endDate={endDate || undefined} /></div>
      </div>

      {/* Cost Anomaly Detection */}
      <div className="bg-gradient-to-b from-amber-50/30 to-white rounded-2xl border border-amber-100/50 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          <span className="font-semibold text-sm text-slate-800">成本异常检测</span>
        </div>
        <div className="px-5 pb-5"><LogAnomaliesPanel days={7} /></div>
      </div>

      {/* Filters */}
      <LogFilters
        filters={{ keyword, modelName, status: statusFilter, startDate, endDate }}
        setFilter={(key, value) => setFilter(key as any, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchLogs}
      />

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Log Table */}
      <LogList
        logs={logs}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
        onSelectLog={setSelectedLogId}
      />

      {/* Log Detail Drawer */}
      <LogDetail logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
    </div>
  )
}
