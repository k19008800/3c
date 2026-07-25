// ──────────────────────────────────────────────
//  ActivityTimeline — 操作时间线组件
// ──────────────────────────────────────────────

import { useState } from 'react'
import type { UserActivityItem } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ActivityTimelineProps {
  activities: UserActivityItem[]
  loading?: boolean
}

// ── 状态样式映射 ──

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  success: { bg: 'bg-green-100', text: 'text-green-700', label: '成功' },
  failure: { bg: 'bg-red-100', text: 'text-red-700', label: '失败' },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '进行中' },
}

// ── 时间格式化 ──

function formatTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString)
  const date = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return { date, time }
}

// ── 单条活动项 ──

function ActivityItem({ activity, isLast }: { activity: UserActivityItem; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const { date, time } = formatTime(activity.createdAt)
  const statusStyle = STATUS_STYLES[activity.status] || { bg: 'bg-slate-100', text: 'text-slate-700', label: activity.status }

  return (
    <div className="relative flex gap-4">
      {/* 时间轴线 */}
      <div className="flex flex-col items-center shrink-0 w-20">
        <span className="text-xs text-slate-500">{date}</span>
        <span className="text-xs text-slate-400">{time}</span>
      </div>

      {/* 时间轴圆点 */}
      <div className="relative flex flex-col items-center shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
          activity.status === 'success' ? 'bg-green-50' :
          activity.status === 'failure' ? 'bg-red-50' : 'bg-yellow-50'
        }`}>
          {activity.actionIcon}
        </div>
        {!isLast && (
          <div className="absolute top-8 w-0.5 h-full bg-slate-200" />
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-w-0 pb-6">
        <div
          className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 cursor-pointer transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {/* 头部 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{activity.actionLabel}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
            </div>
            {expanded ? (
              <ChevronUp className="shrink-0 text-slate-400" size={16} />
            ) : (
              <ChevronDown className="shrink-0 text-slate-400" size={16} />
            )}
          </div>

          {/* 摘要 */}
          {activity.summary && (
            <p className="mt-1 text-xs text-slate-600 line-clamp-2">{activity.summary}</p>
          )}

          {/* 资源信息 */}
          {activity.resourceName && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="bg-slate-100 px-1.5 py-0.5 rounded">{activity.targetType || '资源'}</span>
              <span className="truncate">{activity.resourceName}</span>
            </div>
          )}

          {/* 展开详情 */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">分类：</span>
                  <span>{activity.categoryLabel}</span>
                </div>
                <div>
                  <span className="text-slate-400">角色：</span>
                  <span>{activity.userRole}</span>
                </div>
                {activity.ip && (
                  <div>
                    <span className="text-slate-400">IP：</span>
                    <span className="font-mono">{activity.ip}</span>
                  </div>
                )}
                {activity.targetId && (
                  <div>
                    <span className="text-slate-400">对象 ID：</span>
                    <span>#{activity.targetId}</span>
                  </div>
                )}
              </div>

              {/* User-Agent */}
              {activity.userAgent && (
                <div className="text-xs">
                  <span className="text-slate-400">User-Agent：</span>
                  <span className="text-slate-600 break-all">{activity.userAgent}</span>
                </div>
              )}

              {/* 失败原因 */}
              {activity.errorReason && (
                <div className="text-xs text-red-600">
                  <span className="font-medium">失败原因：</span>
                  <span>{activity.errorReason}</span>
                </div>
              )}

              {/* 元数据 */}
              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                <div className="text-xs">
                  <span className="text-slate-400">附加信息：</span>
                  <pre className="mt-1 p-2 bg-slate-50 rounded text-xs overflow-x-auto">
                    {JSON.stringify(activity.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ChevronUp 组件（lucide-react 没有直接导出时使用）
function ChevronUp({ className, size }: { className?: string; size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

// ── 时间线组件 ──

export function ActivityTimeline({ activities, loading }: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p className="text-4xl mb-2">📭</p>
        <p>暂无操作记录</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, index) => (
        <ActivityItem
          key={activity.id}
          activity={activity}
          isLast={index === activities.length - 1}
        />
      ))}
    </div>
  )
}
