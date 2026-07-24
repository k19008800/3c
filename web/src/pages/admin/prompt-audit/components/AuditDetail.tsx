import { X, AlertTriangle } from 'lucide-react'
import type { PromptAuditDetail } from '../types'

interface AuditDetailProps {
  detail: PromptAuditDetail | null
  loading: boolean
  onClose: () => void
  onAudit?: (action: 'reviewed' | 'flagged' | 'ignored', reason?: string) => void
}

export default function AuditDetail({ detail, loading, onClose, onAudit }: AuditDetailProps) {
  if (!detail && !loading) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">审计详情</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : detail ? (
          <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500">用户</div>
                <div className="text-sm">{detail.userEmail || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">API Key</div>
                <div className="text-sm">{detail.keyName || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">模型</div>
                <div className="text-sm">{detail.modelName || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">状态</div>
                <div className="text-sm">{detail.auditStatus}</div>
              </div>
            </div>

            {/* Sensitive words */}
            {detail.isSensitive && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  <span className="text-sm font-medium text-red-800">敏感词检测</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(detail.sensitiveWords || []).map((w, i) => (
                    <span key={i} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Prompt */}
            <div>
              <div className="text-xs text-slate-500 mb-1">完整提示词</div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm overflow-x-auto max-h-64">
                {detail.prompt}
              </pre>
            </div>

            {/* Response summary */}
            {detail.responseSummary && (
              <div>
                <div className="text-xs text-slate-500 mb-1">响应摘要</div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                  {detail.responseSummary}
                </div>
              </div>
            )}

            {/* Actions */}
            {detail.auditStatus === 'pending' && onAudit && (
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  onClick={() => onAudit('ignored')}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50"
                >
                  忽略
                </button>
                <button
                  onClick={() => onAudit('flagged')}
                  className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                >
                  标记
                </button>
                <button
                  onClick={() => onAudit('reviewed')}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  通过
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}