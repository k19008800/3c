import { Eye, Flag, CheckCircle, Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { PromptAuditItem } from '../types'

interface AuditTableProps {
  logs: PromptAuditItem[]
  onView: (id: number) => void
  onAudit: (id: number, action: 'reviewed' | 'flagged' | 'ignored') => void
}

export default function AuditTable({ logs, onView, onAudit }: AuditTableProps) {
  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: '待审核' },
      reviewed: { variant: 'default', label: '已审核' },
      flagged: { variant: 'destructive', label: '已标记' },
      ignored: { variant: 'outline', label: '已忽略' },
    }
    const cfg = map[status] || { variant: 'outline', label: status }
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left">ID</th>
            <th className="px-4 py-3 text-left">用户</th>
            <th className="px-4 py-3 text-left">模型</th>
            <th className="px-4 py-3 text-left">提示词预览</th>
            <th className="px-4 py-3 text-left">敏感词</th>
            <th className="px-4 py-3 text-left">状态</th>
            <th className="px-4 py-3 text-left">时间</th>
            <th className="px-4 py-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-600">{log.id}</td>
              <td className="px-4 py-3">
                <div className="text-slate-900">{log.userEmail || '—'}</div>
                <div className="text-xs text-slate-500">{log.keyName || '—'}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{log.modelName || '—'}</td>
              <td className="px-4 py-3">
                <div className="max-w-xs truncate text-slate-700">{log.promptPreview}</div>
              </td>
              <td className="px-4 py-3">
                {log.isSensitive ? (
                  <div className="flex flex-wrap gap-1">
                    {(log.sensitiveWords || []).slice(0, 3).map((w, i) => (
                      <Badge key={i} variant="destructive" className="text-xs">
                        {w}
                      </Badge>
                    ))}
                    {log.sensitiveWords && log.sensitiveWords.length > 3 && (
                      <span className="text-xs text-slate-500">+{log.sensitiveWords.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">{getStatusBadge(log.auditStatus)}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">
                {new Date(log.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onView(log.id)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                    title="查看详情"
                  >
                    <Eye size={16} />
                  </button>
                  {log.auditStatus === 'pending' && (
                    <>
                      <button
                        onClick={() => onAudit(log.id, 'reviewed')}
                        className="p-1 text-slate-400 hover:text-green-600"
                        title="通过"
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => onAudit(log.id, 'flagged')}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="标记"
                      >
                        <Flag size={16} />
                      </button>
                      <button
                        onClick={() => onAudit(log.id, 'ignored')}
                        className="p-1 text-slate-400 hover:text-slate-600"
                        title="忽略"
                      >
                        <Ban size={16} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}