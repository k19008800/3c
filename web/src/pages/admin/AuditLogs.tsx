// ── 审计日志页面（入口）──

import { useEffect, useState, useCallback, useMemo } from 'react'
import { get } from '@/lib/api'
import type { AuditLog, PaginatedData } from '@/types'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { RefreshCw, Download, AlertCircle } from 'lucide-react'
import AuditStatsCards from './audit-logs/AuditStatsCards'
import AuditFilters from './audit-logs/AuditFilters'
import AuditList from './audit-logs/AuditList'
import AuditDetail from './audit-logs/AuditDetail'
import type { FilterValues, AuditStats } from './audit-logs/types'
import { computeAuditStats } from './audit-logs/types'

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  // ── 持久化筛选 ──
  const {
    filters: rawFilters,
    setFilter,
    resetFilters,
    setFilters,
    hasActiveFilters,
  } = usePersistedFilters({
    storageKey: 'admin-audit-logs',
    defaults: {
      keyword: '',
      action: '',
      targetType: '',
      operator: '',
      targetId: '',
      startDate: '',
      endDate: '',
      page: 1,
      pageSize: 20,
    },
  })
  const filters = rawFilters as unknown as FilterValues
  const {
    keyword,
    action: actionFilter,
    targetType: targetTypeFilter,
    operator: operatorKeyword,
    targetId: targetIdFilter,
    startDate,
    endDate,
    page,
    pageSize,
  } = filters

  // ── 获取日志列表 ──
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (actionFilter) params.action = actionFilter
      if (targetTypeFilter) params.targetType = targetTypeFilter
      if (targetIdFilter) params.targetId = targetIdFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      params.keyword = operatorKeyword || keyword
      const data = await get<PaginatedData<AuditLog>>('/api/v1/admin/audit-logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, actionFilter, targetTypeFilter, targetIdFilter, operatorKeyword, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // ── 审计统计数据 ──
  const stats: AuditStats | null = useMemo(() => {
    if (logs.length === 0) return null
    return computeAuditStats(logs)
  }, [logs])

  // ── CSV 导出 ──
  const exportCsv = useCallback(() => {
    const params = new URLSearchParams()
    const q = operatorKeyword || keyword
    if (q) params.set('keyword', q)
    if (actionFilter) params.set('action', actionFilter)
    if (targetTypeFilter) params.set('targetType', targetTypeFilter)
    if (targetIdFilter) params.set('targetId', targetIdFilter)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    const token = localStorage.getItem('accessToken')
    fetch(`/api/v1/admin/audit-logs/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch((err) => console.error('导出失败:', err))
  }, [keyword, actionFilter, targetTypeFilter, targetIdFilter, operatorKeyword, startDate, endDate])

  // ── 操作人快速筛选 ──
  const filterByOperator = useCallback(
    (email: string | null) => setFilter('operator', email || ''),
    [setFilter],
  )

  const onPageChange = useCallback(
    (p: number) => {
      setFilter('page', p)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [setFilter],
  )

  const onPageSizeChange = useCallback(
    (s: number) => {
      setFilters({ pageSize: s, page: 1 })
    },
    [setFilters],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">审计日志</h1>
        <FeatureDescription page="admin/audit-logs" className="ml-2" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={14} />
            导出 CSV
          </button>
          <button
            onClick={() => {
              setFilter('page', 1)
              fetchLogs()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <AuditStatsCards stats={stats} loading={loading} />

      {/* Filters */}
      <AuditFilters
        filters={filters}
        setFilter={setFilter}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchLogs}
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* List table */}
      <AuditList
        logs={logs}
        total={total}
        loading={loading}
        error={error}
        page={page}
        pageSize={pageSize}
        onOpenDetail={setDetailLog}
        onFilterByOperator={filterByOperator}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      {/* Detail dialog */}
      {detailLog && <AuditDetail log={detailLog} onClose={() => setDetailLog(null)} />}
    </div>
  )
}
