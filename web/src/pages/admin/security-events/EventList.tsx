import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { SecurityEvent } from '@/types'
import RiskBadge from '@/components/security/RiskBadge'
import PaginationBar from '@/components/ui/PaginationBar'
import { eventTypeLabels } from './types'
import {
  Loader2, ShieldAlert, ExternalLink,
  CheckCircle2, CheckSquare, Square, ChevronRight,
} from 'lucide-react'

interface EventListProps {
  events: SecurityEvent[]
  selectedIds: Set<number>
  loading: boolean
  error: string
  page: number
  totalPages: number
  pageSize: number
  total: number
  onToggleSelect: (id: number) => void
  onToggleSelectAll: () => void
  onSelectEvent: (event: SecurityEvent) => void
  onAck: (id: number) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function EventList({
  events,
  selectedIds,
  loading,
  error,
  page,
  totalPages,
  pageSize,
  total,
  onToggleSelect,
  onToggleSelectAll,
  onSelectEvent,
  onAck,
  onPageChange,
  onPageSizeChange,
}: EventListProps) {
  const allSelected = useMemo(
    () => events.length > 0 && selectedIds.size === events.length,
    [events.length, selectedIds.size],
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center py-12 text-slate-400">
          <ShieldAlert size={48} className="mb-2" />
          <p>加载失败：{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center py-12 text-slate-400">
          <ShieldAlert size={48} className="mb-2" />
          <p>暂无安全事件</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-2 py-3 w-10 text-center">
                  <button onClick={onToggleSelectAll} className="p-1 hover:bg-slate-200 rounded">
                    {allSelected ? (
                      <CheckSquare size={14} className="text-blue-600" />
                    ) : (
                      <Square size={14} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">风险</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">地点</th>
                <th className="px-4 py-3 text-center">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  isSelected={selectedIds.has(ev.id)}
                  onToggleSelect={onToggleSelect}
                  onSelectEvent={onSelectEvent}
                  onAck={onAck}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}

/* ── 单行 ── */

function EventRow({
  event: ev,
  isSelected,
  onToggleSelect,
  onSelectEvent,
  onAck,
}: {
  event: SecurityEvent
  isSelected: boolean
  onToggleSelect: (id: number) => void
  onSelectEvent: (event: SecurityEvent) => void
  onAck: (id: number) => void
}) {
  const handleRowClick = useCallback(() => onSelectEvent(ev), [ev, onSelectEvent])
  const handleCheckClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleSelect(ev.id)
    },
    [ev.id, onToggleSelect],
  )
  const handleAckClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onAck(ev.id)
    },
    [ev.id, onAck],
  )
  const handleBanLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])
  const handleUserLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const rowHighlight = useMemo(() => {
    if (!ev.acknowledged && ev.riskLevel === 'critical') return 'bg-red-50'
    return ''
  }, [ev.acknowledged, ev.riskLevel])

  return (
    <tr
      className={`hover:bg-slate-50 cursor-pointer transition ${rowHighlight} ${
        isSelected ? 'bg-blue-50/50' : ''
      }`}
      onClick={handleRowClick}
    >
      <td className="px-2 py-3 text-center">
        <button onClick={handleCheckClick} className="p-1 hover:bg-slate-200 rounded">
          {isSelected ? (
            <CheckSquare size={14} className="text-blue-600" />
          ) : (
            <Square size={14} className="text-slate-400" />
          )}
        </button>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        {new Date(ev.createdAt).toLocaleString('zh-CN')}
      </td>
      <td className="px-4 py-3">
        <RiskBadge level={ev.riskLevel} />
      </td>
      <td className="px-4 py-3 text-sm font-medium text-slate-800">
        {eventTypeLabels[ev.eventType] || ev.eventType}
        {ev.eventType === 'ip_banned' && (
          <Link
            to="/admin/security/bans"
            onClick={handleBanLinkClick}
            className="ml-1 text-blue-500 hover:text-blue-700 inline-flex"
          >
            <ExternalLink size={10} />
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">
        {ev.userId ? (
          <Link
            to={`/admin/users?id=${ev.userId}`}
            onClick={handleUserLinkClick}
            className="text-blue-600 hover:text-blue-800"
          >
            #{ev.userId}
          </Link>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{ev.ip}</td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {ev.city ? `${ev.city}${ev.country ? `, ${ev.country}` : ''}` : '-'}
      </td>
      <td className="px-4 py-3 text-center">
        {ev.acknowledged ? (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            已确认
          </span>
        ) : (
          <button
            onClick={handleAckClick}
            className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full transition flex items-center gap-1 mx-auto"
          >
            <CheckCircle2 size={12} /> 确认
          </button>
        )}
      </td>
    </tr>
  )
}
