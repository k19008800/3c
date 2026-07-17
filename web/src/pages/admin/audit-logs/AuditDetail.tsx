// ── 审计日志详情弹窗 ──

import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { AuditLog, AuditLogDetail } from '@/types'
import { Loader2, AlertCircle, X } from 'lucide-react'
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

/* ── Diff 展示组件 ── */

function DiffViewer({ before, after }: { before: any; after: any }) {
  if (!before && !after) return <p className="text-sm text-slate-400">无变更数据</p>

  const beforeObj = typeof before === 'object' && before !== null ? before : {}
  const afterObj = typeof after === 'object' && after !== null ? after : {}

  const allKeys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])].sort()

  if (allKeys.length === 0) {
    // 非对象：直接显示 JSON
    return (
      <div className="space-y-2">
        {before != null && (
          <div className="flex">
            <span className="shrink-0 w-12 text-xs font-medium text-red-500">变更前</span>
            <code className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded flex-1 break-all">
              {typeof before === 'string' ? before : JSON.stringify(before)}
            </code>
          </div>
        )}
        {after != null && (
          <div className="flex">
            <span className="shrink-0 w-12 text-xs font-medium text-emerald-500">变更后</span>
            <code className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded flex-1 break-all">
              {typeof after === 'string' ? after : JSON.stringify(after)}
            </code>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 text-left text-xs text-slate-500">
            <th className="px-3 py-2 font-medium">字段</th>
            <th className="px-3 py-2 font-medium">变更前</th>
            <th className="px-3 py-2 font-medium">变更后</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {allKeys.map((key) => {
            const beforeVal = JSON.stringify(beforeObj[key] ?? '__NULL__')
            const afterVal = JSON.stringify(afterObj[key] ?? '__NULL__')
            if (beforeVal === afterVal && !['updatedAt', 'createdAt'].includes(key)) return null
            const changed = beforeVal !== afterVal

            return (
              <tr key={key} className={changed ? 'bg-yellow-50/40' : ''}>
                <td className="px-3 py-2 text-xs font-mono text-slate-600 w-28">{key}</td>
                <td className="px-3 py-2">
                  {beforeObj[key] != null ? (
                    <code className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded break-all inline-block max-w-[200px]">
                      {beforeVal === '__NULL__' ? (
                        <span className="text-slate-300 italic">null</span>
                      ) : (
                        beforeVal
                      )}
                    </code>
                  ) : (
                    <span className="text-slate-300 text-xs italic">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {afterObj[key] != null ? (
                    <code className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded break-all inline-block max-w-[200px]">
                      {afterVal === '__NULL__' ? (
                        <span className="text-slate-300 italic">null</span>
                      ) : (
                        afterVal
                      )}
                    </code>
                  ) : (
                    <span className="text-slate-300 text-xs italic">-</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── 详情弹窗 ── */

interface Props {
  log: AuditLog | null
  onClose: () => void
}

export default function AuditDetail({ log, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AuditLogDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!log) return
    setLoading(true)
    setError('')
    get<AuditLogDetail>(`/api/v1/admin/audit-logs/${log.id}`)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [log])

  if (!log) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">操作详情</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 m-6 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : detail ? (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">操作人</span>
                <p className="text-slate-900 font-medium mt-0.5">
                  {detail.operatorNickname || detail.operatorEmail || `#${detail.operatorId}`}
                  <span className="text-slate-400 font-normal ml-2">
                    ({detail.operatorEmail || '-'})
                  </span>
                </p>
              </div>
              <div>
                <span className="text-slate-400">操作类型</span>
                <p className="mt-0.5">
                  <ActionBadge action={detail.actionLabel} />
                </p>
              </div>
              <div>
                <span className="text-slate-400">操作对象</span>
                <p className="text-slate-900 font-medium mt-0.5">
                  {detail.targetTypeLabel}
                  {detail.targetId ? ` #${detail.targetId}` : ''}
                  {detail.targetName ? (
                    <span className="text-slate-500 font-normal ml-1">({detail.targetName})</span>
                  ) : null}
                </p>
              </div>
              <div>
                <span className="text-slate-400">IP 地址</span>
                <p className="text-slate-900 font-mono text-xs mt-0.5">{detail.ip || '-'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">操作时间</span>
                <p className="text-slate-900 mt-0.5">
                  {new Date(detail.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              </div>
              {detail.description && (
                <div className="col-span-2">
                  <span className="text-slate-400">操作描述</span>
                  <p className="text-slate-900 mt-0.5">{detail.description}</p>
                </div>
              )}
            </div>

            {(detail.before || detail.after) && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">变更内容</h3>
                <DiffViewer before={detail.before} after={detail.after} />
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
