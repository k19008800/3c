// ── KeyUsageLogs — 使用日志弹窗 ──
// 展示 Key 的调用记录列表 + 每日调用量趋势图（MiniChart）

import { useEffect, useState, useCallback, useMemo } from 'react'
import { get } from '@/lib/api'
import MiniChart from '@/components/ui/MiniChart'
import {
  Loader2, FileText, X, AlertCircle, ChevronLeft, ChevronRight,
} from 'lucide-react'

interface AdminKeyUsageLog {
  id: number
  keyId: number
  action: string
  ip: string | null
  path: string | null
  success: boolean
  createdAt: string
}

interface KeyUsageLogsProps {
  keyId: number | null
  onClose: () => void
}

const LOG_PAGE_SIZE = 20

export default function KeyUsageLogs({ keyId, onClose }: KeyUsageLogsProps) {
  const [logs, setLogs] = useState<AdminKeyUsageLog[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const totalPages = Math.ceil(logTotal / LOG_PAGE_SIZE)

  const fetchLogs = useCallback(async (p: number) => {
    if (keyId === null) return
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: AdminKeyUsageLog[]; total: number }>(
        `/api/v1/admin/api-keys/${keyId}/logs`,
        { page: p, pageSize: LOG_PAGE_SIZE },
      )
      setLogs(data.list || [])
      setLogTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取日志失败')
      setLogs([])
      setLogTotal(0)
    } finally {
      setLoading(false)
    }
  }, [keyId])

  useEffect(() => {
    if (keyId !== null) {
      setLogPage(1)
      fetchLogs(1)
    }
  }, [keyId, fetchLogs])

  // ── 从日志数据聚合每日调用趋势 ──
  const trendData = useMemo(() => {
    if (logs.length === 0) return []
    const dayCount = new Map<string, number>()
    for (const log of logs) {
      const day = log.createdAt.slice(0, 10) // YYYY-MM-DD
      dayCount.set(day, (dayCount.get(day) || 0) + 1)
    }
    // 按日期排序，取最近 7 天
    const sorted = [...dayCount.entries()].sort(([a], [b]) => a.localeCompare(b))
    return sorted.slice(-7).map(([date, count]) => ({
      value: count,
      label: date.slice(5), // MM-DD
    }))
  }, [logs])

  if (keyId === null) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 max-w-3xl w-full mx-4 shadow-xl space-y-4 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <FileText size={18} />
            Key 使用日志 (ID: {keyId})
            {logTotal > 0 && (
              <span className="text-xs font-normal text-slate-400">
                共 {logTotal} 条
              </span>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Trend chart */}
        {trendData.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-xs font-medium text-slate-500 mb-2">每日调用趋势（最近 7 天）</p>
            <MiniChart
              data={trendData}
              width={400}
              height={48}
              color="#f59e0b"
              gradient
              type="bar"
            />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin" size={20} />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && logs.length === 0 && (
          <div className="py-8 text-center text-slate-400 text-sm">暂无使用记录</div>
        )}

        {/* Log table */}
        {!loading && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">操作</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">路径</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">IP</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">结果</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <tr key={log.id} className="text-sm">
                    <td className="px-3 py-2 text-slate-700">{log.action}</td>
                    <td className="px-3 py-2 text-slate-500 font-mono text-xs max-w-[200px] truncate" title={log.path || ''}>
                      {log.path || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{log.ip || '-'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {log.success ? '成功' : '失败'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
                <span className="text-xs text-slate-400">
                  第 {logPage} / {totalPages} 页
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const next = Math.max(1, logPage - 1)
                      setLogPage(next)
                      fetchLogs(next)
                    }}
                    disabled={logPage <= 1}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => {
                      const next = Math.min(totalPages, logPage + 1)
                      setLogPage(next)
                      fetchLogs(next)
                    }}
                    disabled={logPage >= totalPages}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
