// ── 审计日志列表 ──

import { Eye } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { TableSkeleton } from '@/components/ui/skeleton'
import type { AuditLog } from '@/types'
import type { FilterValues } from './types'
import { ACTION_COLORS } from './types'

/* ── 操作类型标签 ── */

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] || 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {action}
    </span>
  )
}

/* ── Props ── */

interface Props {
  logs: AuditLog[]
  total: number
  loading: boolean
  error: string
  page: number
  pageSize: number
  onOpenDetail: (log: AuditLog) => void
  onFilterByOperator: (email: string | null) => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
}

/* ── 主组件 ── */

export default function AuditList({
  logs,
  total,
  loading,
  error,
  page,
  pageSize,
  onOpenDetail,
  onFilterByOperator,
  onPageChange,
  onPageSizeChange,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 text-sm border-b border-slate-200">
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作人</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作类型</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作对象</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">变更摘要</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">IP</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  暂无审计日志
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 max-w-[160px]">
                    <button
                      onClick={() => onFilterByOperator(log.operatorEmail)}
                      title={`筛选: ${log.operatorEmail || ''}`}
                      className="hover:text-blue-600 hover:underline transition truncate block max-w-full"
                    >
                      {log.operatorNickname || log.operatorEmail || `#${log.operatorId}`}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={log.actionLabel} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[180px] truncate">
                    {log.targetTypeLabel}
                    {log.targetId != null ? ` #${log.targetId}` : ''}
                    {log.targetName ? (
                      <span className="text-slate-400 ml-1">({log.targetName})</span>
                    ) : null}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-500 max-w-[220px] truncate"
                    title={log.description || undefined}
                  >
                    {log.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono text-xs">{log.ip || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onOpenDetail(log)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
                    >
                      <Eye size={14} />
                      查看变更
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={Math.ceil(total / pageSize)}
        />
      )}
    </div>
  )
}
