import { useState, useCallback, useMemo } from 'react'
import { Loader2, Zap, Gauge } from 'lucide-react'
import type { LogItem } from '@/types'
import VirtualTable from '@/components/VirtualTable'

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

type ColumnKey = typeof COLUMNS[number]['key']

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

interface VirtualLogsTableProps {
  logs: LogItem[]
  total: number
  loading: boolean
  error: string
  isVisible: (key: string) => boolean
  setDetailId: (id: number | null) => void
  height?: number
  useVirtualScroll?: boolean
}

export default function VirtualLogsTable({
  logs,
  total,
  loading,
  error,
  isVisible,
  setDetailId,
  height = 600,
  useVirtualScroll = true,
}: VirtualLogsTableProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)

  // 处理行悬停
  const handleRowMouseEnter = useCallback((index: number) => {
    setHoveredRow(index)
  }, [])

  const handleRowMouseLeave = useCallback(() => {
    setHoveredRow(null)
  }, [])

  // 获取可见的列定义
  const visibleColumns = useMemo(() => {
    return COLUMNS.filter(col => isVisible(col.key))
  }, [isVisible])

  // 定义虚拟表格的列
  const columns = useMemo(() => {
    return visibleColumns.map(col => {
      const colKey = col.key as string
      const baseColumn = {
        key: colKey,
        label: col.label,
        width: colKey === 'id' ? 80 : 
               colKey === 'createdAt' ? 180 :
               colKey === 'modelName' ? 150 :
               colKey === 'vendorName' ? 120 :
               colKey === 'promptTokens' ? 100 :
               colKey === 'completionTokens' ? 120 :
               colKey === 'totalTokens' ? 100 :
               colKey === 'cost' ? 120 :
               colKey === 'status' ? 100 :
               colKey === 'durationMs' ? 100 :
               colKey === 'isStreaming' ? 80 :
               colKey === 'errorMessage' ? 200 : 120,
        align: ['promptTokens', 'completionTokens', 'totalTokens', 'cost'].includes(colKey) 
          ? 'right' as const 
          : 'left' as const,
      }

      // 添加渲染函数
      return {
        ...baseColumn,
        render: (log: LogItem, index: number) => {
          switch (colKey) {
            case 'id':
              return <div className="text-slate-400 font-mono">{log.id}</div>
            
            case 'createdAt':
              return <div className="text-slate-600 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</div>
            
            case 'modelName':
              return <div className="font-medium text-slate-900">{log.modelName}</div>
            
            case 'vendorName':
              return <div className="text-slate-600">{log.vendorName}</div>
            
            case 'promptTokens':
              return <div className="text-slate-600 text-right">{log.promptTokens?.toLocaleString() || '-'}</div>
            
            case 'completionTokens':
              return <div className="text-slate-600 text-right">{log.completionTokens?.toLocaleString() || '-'}</div>
            
            case 'totalTokens':
              return <div className="text-slate-600 text-right font-medium">{log.totalTokens?.toLocaleString() || '-'}</div>
            
            case 'cost':
              return <div className="text-slate-600 text-right">¥{Number(log.cost || 0).toFixed(6)}</div>
            
            case 'status':
              return <StatusBadge status={log.status} />
            
            case 'durationMs':
              return <LatencyBadge durationMs={log.durationMs} />
            
            case 'isStreaming':
              return log.isStreaming ? (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  <Zap size={10} />流式
                </span>
              ) : (
                <span className="text-xs text-slate-400">非流式</span>
              )
            
            case 'errorMessage':
              return (
                <div 
                  className="text-sm text-red-500 truncate" 
                  title={log.errorMessage || ''}
                >
                  {log.errorMessage || '-'}
                </div>
              )
            
            default:
              return <div>{String((log as any)[colKey] || '')}</div>
          }
        }
      }
    })
  }, [visibleColumns])

  // 处理行点击
  const handleRowClick = useCallback((log: LogItem) => {
    setDetailId(log.id)
  }, [setDetailId])

  // 自定义行渲染器，添加悬停效果
  const rowRenderer = useCallback((log: LogItem, index: number, children: React.ReactNode) => {
    return (
      <div 
        className={`transition-colors ${hoveredRow === index ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
        onMouseEnter={() => handleRowMouseEnter(index)}
        onMouseLeave={handleRowMouseLeave}
      >
        {children}
      </div>
    )
  }, [hoveredRow, handleRowMouseEnter, handleRowMouseLeave])

  // 错误状态
  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin inline-block" size={32} />
      </div>
    )
  }

  // 空状态
  if (logs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">暂无日志数据</div>
    )
  }

  // 如果不使用虚拟滚动，回退到普通表格
  if (!useVirtualScroll) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                {visibleColumns.map(col => (
                  <th key={col.key} className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // 使用虚拟滚动表格
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <VirtualTable
        data={logs}
        columns={columns}
        rowHeight={56}
        height={height}
        onRowClick={handleRowClick}
        rowRenderer={rowRenderer}
        className="virtual-logs-table"
        headerClassName="bg-slate-50"
        rowClassName="border-b border-slate-100 cursor-pointer"
        cellClassName="px-4 py-3"
      />
    </div>
  )
}