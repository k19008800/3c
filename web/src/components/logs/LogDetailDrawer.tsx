import { useEffect, useState } from 'react'
import { X, Clock, Cpu, Coins, Globe, AlertCircle, CheckCircle2, Zap, Key, Monitor, Loader2 } from 'lucide-react'
import { get } from '@/lib/api'
import type { LogItem } from '@/types'

interface LogDetailDrawerProps {
  logId: number | null
  onClose: () => void
}

export default function LogDetailDrawer({ logId, onClose }: LogDetailDrawerProps) {
  const [log, setLog] = useState<LogItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!logId) { setLog(null); return }
    setLoading(true)
    setError('')
    get<LogItem>(`/api/v1/logs/${logId}`)
      .then(data => setLog(data))
      .catch(err => setError(err.message || '获取详情失败'))
      .finally(() => setLoading(false))
  }, [logId])

  const getStatusBadge = (status: string) => {
    const map: Record<string, { color: string; label: string; icon: any }> = {
      success: { color: 'bg-green-100 text-green-700', label: '成功', icon: CheckCircle2 },
      failed: { color: 'bg-red-100 text-red-700', label: '失败', icon: AlertCircle },
      timeout: { color: 'bg-orange-100 text-orange-700', label: '超时', icon: Clock },
      cancelled: { color: 'bg-gray-100 text-gray-600', label: '已取消', icon: X },
      pending: { color: 'bg-yellow-100 text-yellow-700', label: '处理中', icon: Loader2 },
    }
    const s = map[status] || { color: 'bg-slate-100 text-slate-700', label: status, icon: Zap }
    const Icon = s.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
        <Icon size={12} />
        {s.label}
      </span>
    )
  }

  if (!logId) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">调用详情</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : log ? (
            <div className="space-y-6">
              {/* 状态 & ID */}
              <div className="flex items-center justify-between">
                {getStatusBadge(log.status)}
                <span className="text-xs text-slate-400 font-mono">ID: {log.id}</span>
              </div>

              {/* 模型 & 供应商 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                    <Cpu size={14} />
                    模型
                  </div>
                  <p className="text-sm font-medium text-slate-900">{log.modelName || '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                    <Globe size={14} />
                    供应商
                  </div>
                  <p className="text-sm font-medium text-slate-900">{log.vendorName || '-'}</p>
                </div>
              </div>

              {/* Token 明细 */}
              <div>
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-3">
                  <Zap size={14} />
                  Token 消耗
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Prompt</span>
                    <span className="font-medium">{log.promptTokens?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Completion</span>
                    <span className="font-medium">{log.completionTokens?.toLocaleString() || 0}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-sm font-semibold">
                    <span className="text-slate-800">总计</span>
                    <span className="text-slate-900">{log.totalTokens?.toLocaleString() || 0}</span>
                  </div>
                  {/* Progress bar */}
                  {log.totalTokens > 0 && (
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, ((log.promptTokens || 0) / log.totalTokens) * 100)}%` }}
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 text-right">蓝色 = Prompt 占比</p>
                </div>
              </div>

              {/* 费用 & 耗时 & 流式 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">
                    <Coins size={12} className="inline mr-1" />
                    费用
                  </p>
                  <p className="text-sm font-semibold text-green-700">
                    ¥{Number(log.cost || 0).toFixed(6)}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">
                    <Clock size={12} className="inline mr-1" />
                    耗时
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {log.durationMs != null ? `${log.durationMs}ms` : '-'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">
                    <Zap size={12} className="inline mr-1" />
                    模式
                  </p>
                  <p className={`text-sm font-semibold ${log.isStreaming ? 'text-blue-600' : 'text-slate-600'}`}>
                    {log.isStreaming ? '流式' : '非流式'}
                  </p>
                </div>
              </div>

              {/* API Key */}
              {(log as any).apiKeyId != null && (
                <div className="flex items-center gap-2 text-sm">
                  <Key size={14} className="text-slate-400" />
                  <span className="text-slate-600">API Key ID:</span>
                  <span className="font-mono text-slate-900">{(log as any).apiKeyId}</span>
                </div>
              )}

              {/* User Agent */}
              {(log as any).userAgent && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    <Monitor size={12} className="inline mr-1" />
                    User-Agent
                  </p>
                  <p className="text-xs text-slate-600 font-mono break-all bg-slate-50 p-2 rounded">
                    {(log as any).userAgent}
                  </p>
                </div>
              )}

              {/* 网络信息 */}
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  <Globe size={12} className="inline mr-1" />
                  网络信息
                </p>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">IP 地址</span>
                    <span className="font-mono text-slate-700">{log.requestIp || '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">地理位置</span>
                    <span className="text-slate-700">
                      {log.geoCountry && log.geoCity
                        ? `${log.geoCountry} · ${log.geoCity}`
                        : log.geoCountry || log.geoCity || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">代理/VPN</span>
                    <span className={log.isProxy ? 'text-red-600 font-medium' : 'text-green-600'}>
                      {log.isProxy ? '是 ⚠️' : '否'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 错误信息 */}
              {log.errorMessage && (
                <div>
                  <p className="text-xs text-red-500 mb-1">
                    <AlertCircle size={12} className="inline mr-1" />
                    错误信息
                  </p>
                  <pre className="text-xs text-red-700 bg-red-50 p-3 rounded-lg whitespace-pre-wrap font-mono">
                    {log.errorMessage}
                  </pre>
                </div>
              )}

              {/* 时间 */}
              <div className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                创建时间: {new Date(log.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Animation keyframe (inject via style tag if not in Tailwind config) */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  )
}
