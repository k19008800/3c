import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { SecurityEvent, PaginatedData } from '@/types'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { eventTypeLabels, RISK_ORDER } from './security-events/types'
import EventStatsCards from './security-events/EventStatsCards'
import EventFilters from './security-events/EventFilters'
import EventList from './security-events/EventList'
import EventDetail from './security-events/EventDetail'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, AlertCircle, ShieldAlert, Download, CheckCircle2,
} from 'lucide-react'

export default function AdminSecurityEvents() {
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── 持久化筛选 ──
  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-security-events',
    defaults: { eventType: '', riskLevel: '', acknowledged: '', page: 1, pageSize: 20 },
  })
  const { eventType, riskLevel, acknowledged, page, pageSize } = filters as {
    eventType: string; riskLevel: string; acknowledged: string; page: number; pageSize: number
  }

  // 详情弹窗
  const [detailEvent, setDetailEvent] = useState<SecurityEvent | null>(null)

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchAckLoading, setBatchAckLoading] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  // ── 获取事件列表 ──
  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (eventType) params.eventType = eventType
      if (riskLevel) params.riskLevel = riskLevel
      if (acknowledged) params.acknowledged = acknowledged === 'true'
      const data = await get<PaginatedData<SecurityEvent>>('/api/v1/admin/security/events', params)
      setEvents(
        data.list.sort((a, b) => {
          const ra = RISK_ORDER[a.riskLevel] ?? 99
          const rb = RISK_ORDER[b.riskLevel] ?? 99
          return ra - rb
        }),
      )
      setTotal(data.total)
      setSelectedIds(new Set())
    } catch (err: any) {
      setError(err.message || '获取安全事件失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, eventType, riskLevel, acknowledged])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── 确认单个事件 ──
  const handleAck = useCallback(
    async (id: number) => {
      try {
        await post(`/api/v1/admin/security/events/${id}/ack`)
        fetchEvents()
      } catch (err: any) {
        setError(err.message || '确认失败')
      }
    },
    [fetchEvents],
  )

  // ── 批量确认 ──
  const handleBatchAck = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchAckLoading(true)
    try {
      await post('/api/v1/admin/security/events/batch-ack', { ids })
      fetchEvents()
    } catch (err: any) {
      setError(err.message || '批量确认失败')
    } finally {
      setBatchAckLoading(false)
    }
  }, [selectedIds, fetchEvents])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === events.length) return new Set()
      return new Set(events.map((e) => e.id))
    })
  }, [events])

  // ── CSV 导出（当前页） ──
  const handleExportCsv = useCallback(() => {
    const headers = ['时间', '风险等级', '事件类型', '用户ID', 'IP', '地点', 'UA', '详情', '处理状态']
    const rows = events.map((ev) => [
      new Date(ev.createdAt).toLocaleString('zh-CN'),
      ev.riskLevel,
      eventTypeLabels[ev.eventType] || ev.eventType,
      ev.userId ?? '',
      ev.ip ?? '',
      ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ''}` : '',
      ev.userAgent ?? '',
      typeof ev.detail === 'object' ? JSON.stringify(ev.detail) : String(ev.detail ?? ''),
      ev.acknowledged ? '已处理' : '未处理',
    ])

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `安全事件_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [events])

  // ── 筛选回调（适配 FilterBar 的宽松签名） ──
  const handleFilterChange = useCallback(
    (key: string, value: any) => (setFilter as any)(key, value),
    [setFilter],
  )

  const handlePageChange = useCallback(
    (p: number) => setFilter('page', p),
    [setFilter],
  )

  const handlePageSizeChange = useCallback(
    (s: number) => {
      setFilters({ pageSize: s, page: 1 })
    },
    [setFilters],
  )

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert size={24} /> 安全事件
        </h1>
        <FeatureDescription page="admin/security/events" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            <Download size={14} /> 导出CSV
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchAck}
              disabled={batchAckLoading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {batchAckLoading ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              确认选中 ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── 统计卡片 ── */}
      <EventStatsCards />

      {/* ── 筛选栏 ── */}
      <EventFilters
        eventType={eventType}
        riskLevel={riskLevel}
        acknowledged={acknowledged}
        setFilter={handleFilterChange}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* ── 事件列表 ── */}
      <EventList
        events={events}
        selectedIds={selectedIds}
        loading={loading}
        error={error}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        total={total}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onSelectEvent={setDetailEvent}
        onAck={handleAck}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* ── 详情弹窗 ── */}
      <EventDetail
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onAck={handleAck}
      />
    </div>
  )
}
