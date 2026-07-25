import { useState } from 'react'
import { Loader2, Zap, Gauge } from 'lucide-react'
import type { LogItem } from '@/types'
import VirtualLogsTable from './VirtualLogsTable'

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'createdAt', label: '时间' },
  { key: 'modelName', label: '模型' },
  { key: 'vendorName', label: '供应商' },
  { key: 'promptTokens', label: 'Prompt' },
  { key: 'completionTokens', label: 'Completion' },
  { key: 'totalTokens', label: 'Token' },
  { key: 'cost', label: '消费' },
  { key: 'status', label: '状态' },
  { key: 'durationMs', label: '耗时' },
  { key: 'isStreaming', label: '模式' },
  { key: 'errorMessage', label: '错误信息' },
] as const

interface LogsTableProps {
  logs: LogItem[]
  total: number
  loading: boolean
  error: string
  isVisible: (key: string) => boolean
  setDetailId: (id: number | null) => void
  /** 是否使用虚拟滚动，默认为true */
  useVirtualScroll?: boolean
  /** 虚拟滚动列表高度 */
  virtualScrollHeight?: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    timeout: 'bg-orange-100 text-orange-700',
    cancelled: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
  }
  const labels: Record<string, string> = {
    success: '成功',
    failed: '失败',
    timeout: '超时',
    cancelled: '已取消',
    pending: '处理中',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-700'}`}>
      {labels[status] || status}
    </span>
  )
}

function LatencyBadge({ durationMs }: { durationMs: number | null }) {
  if (durationMs == null) return <span className="text-xs text-slate-400">-</span>

  let color: string
  let bg: string
  if (durationMs < 500) {
    color = 'text-green-700'
    bg = 'bg-green-100'
  } else if (durationMs < 2000) {
    color = 'text-amber-700'
    bg = 'bg-amber-100'
  } else {
    color = 'text-red-700'
    bg = 'bg-red-100'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${bg} ${color}`}>
      <Gauge size={10} />
      {durationMs}ms
    </span>
  )
}

export default function LogsTable({
  logs,
  total,
  loading,
  error,
  isVisible,
  setDetailId,
  useVirtualScroll = true,
  virtualScrollHeight = 600,
}: LogsTableProps) {
  // 如果启用了虚拟滚动，使用VirtualLogsTable组件
  if (useVirtualScroll) {
    return (
      <VirtualLogsTable
        logs={logs}
        total={total}
        loading={loading}
        error={error}
        isVisible={isVisible}
        setDetailId={setDetailId}
        height={virtualScrollHeight}
        useVirtualScroll={useVirtualScroll}
      />
    )
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              {COLUMNS.filter(col => isVisible(col.key)).map(col => (
                <th key={col.key} className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.filter(col => isVisible(col.key)).length} className="text-center py-12">
                  <Loader2 className="animate-spin inline-block" size={24} />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.filter(col => isVisible(col.key)).length} className="text-center py-12 text-slate-400">
                  暂无日志数据
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50 transition cursor-pointer"
                  onClick={() => setDetailId(log.id)}
                >
                  {isVisible('id') && <td className="px-4 py-3 text-sm text-slate-400 font-mono">{log.id}</td>}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                  )}
                  {isVisible('modelName') && <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.modelName}</td>}
                  {isVisible('vendorName') && <td className="px-4 py-3 text-sm text-slate-600">{log.vendorName}</td>}
                  {isVisible('promptTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.promptTokens?.toLocaleString() || '-'}</td>}
                  {isVisible('completionTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right">{log.completionTokens?.toLocaleString() || '-'}</td>}
                  {isVisible('totalTokens') && <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">{log.totalTokens?.toLocaleString() || '-'}</td>}
                  {isVisible('cost') && <td className="px-4 py-3 text-sm text-slate-600 text-right">¥{Number(log.cost || 0).toFixed(6)}</td>}
                  {isVisible('status') && <td className="px-4 py-3"><StatusBadge status={log.status} /></td>}
                  {isVisible('durationMs') && (
                    <td className="px-4 py-3">
                      <LatencyBadge durationMs={log.durationMs} />
                    </td>
                  )}
                  {isVisible('isStreaming') && (
                    <td className="px-4 py-3">
                      {log.isStreaming ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          <Zap size={10} />流式
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">非流式</span>
                      )}
                    </td>
                  )}
                  {isVisible('errorMessage') && (
                    <td className="px-4 py-3 text-sm text-red-500 max-w-[200px] truncate" title={log.errorMessage || ''}>
                      {log.errorMessage || '-'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}