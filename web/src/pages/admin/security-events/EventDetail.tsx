import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { SecurityEvent } from '@/types'
import RiskBadge from '@/components/security/RiskBadge'
import { eventTypeLabels } from './types'
import { Clock, Globe, Monitor, ExternalLink, X, CheckCircle2, Info } from 'lucide-react'

interface EventDetailProps {
  event: SecurityEvent | null
  onClose: () => void
  onAck: (id: number) => void
}

export default function EventDetail({ event, onClose, onAck }: EventDetailProps) {
  const handleAck = useCallback(() => {
    if (event) {
      onAck(event.id)
      onClose()
    }
  }, [event, onAck, onClose])

  if (!event) return null

  const detail = event.detail

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Info size={18} />
            事件详情 #{event.id}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={18} />
          </button>
        </div>

        {/* ── Content ── */}
        <div className="p-6 space-y-3">
          {/* 基本信息网格 */}
          <div className="grid grid-cols-2 gap-3">
            <DetailField label="事件 ID" mono>
              #{event.id}
            </DetailField>
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase mb-0.5">风险等级</div>
              <RiskBadge level={event.riskLevel} />
            </div>
            <DetailField label="事件类型">
              {eventTypeLabels[event.eventType] || event.eventType}
            </DetailField>
            <DetailField label="发生时间" icon={<Clock size={12} />}>
              {new Date(event.createdAt).toLocaleString('zh-CN')}
            </DetailField>
          </div>

          {/* 用户/IP/地点 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetailField label="用户">
              {event.userId ? (
                <Link
                  to={`/admin/users?id=${event.userId}`}
                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  #{event.userId} <ExternalLink size={10} />
                </Link>
              ) : (
                '-'
              )}
            </DetailField>
            <DetailField label="IP 地址" icon={<Globe size={12} />} mono>
              {event.ip ?? '-'}
            </DetailField>
            <DetailField label="地理位置">
              {event.city
                ? `${event.city}${event.country ? `, ${event.country}` : ''}`
                : '-'}
            </DetailField>
          </div>

          {/* UA */}
          {event.userAgent && (
            <DetailField label="用户代理 (UA)" icon={<Monitor size={12} />} mono>
              <span className="break-all">{event.userAgent}</span>
            </DetailField>
          )}

          {/* 事件详情 JSON */}
          {detail && typeof detail === 'object' && Object.keys(detail).length > 0 && (
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase mb-0.5">
                事件详情 (JSON)
              </div>
              <pre className="text-xs text-slate-600 font-mono bg-white p-2 rounded border border-slate-200 overflow-x-auto max-h-40">
                {JSON.stringify(detail, null, 2)}
              </pre>
            </div>
          )}

          {/* 提示 */}
          <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-[10px] text-blue-600 uppercase mb-0.5">⚠️ 说明</div>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>
                • 「确认处理」仅标记该事件为「已阅」的审计操作。如需提前解封用户，请前往
                <Link to="/admin/security/bans" className="underline font-medium ml-1">
                  封禁管理
                </Link>
                操作。
              </li>
              <li>
                • 封禁信息存储在 Redis 中，不会修改用户资料表的任何字段，用户管理页不显示。
              </li>
              <li>
                • 封禁到期后自动解除，届时事件详情中仍可查看历史封禁记录。
              </li>
            </ul>
          </div>

          {/* 处理信息 */}
          {event.acknowledged && (
            <div className="p-2.5 bg-green-50 rounded-lg border border-green-100">
              <div className="text-[10px] text-green-600 uppercase mb-0.5">处理信息</div>
              <div className="text-xs text-green-700">
                已由管理员 #{event.acknowledgedBy}
                {event.acknowledgedAt
                  ? ` 于 ${new Date(event.acknowledgedAt).toLocaleString('zh-CN')}`
                  : ''}{' '}
                确认处理
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          {!event.acknowledged && (
            <button
              onClick={handleAck}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <CheckCircle2 size={14} /> 标记已处理
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 详情字段小组件 ── */

function DetailField({
  label,
  children,
  mono,
  icon,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="p-2.5 bg-slate-50 rounded-lg">
      <div className="text-[10px] text-slate-400 uppercase mb-0.5">{label}</div>
      <div
        className={`text-sm flex items-center gap-1 ${mono ? 'font-mono' : ''} text-slate-700`}
      >
        {icon}
        {children}
      </div>
    </div>
  )
}
