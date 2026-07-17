import { Eye } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/skeleton'
import PaginationBar from '@/components/ui/PaginationBar'
import type { AdminLogItem } from './types'
import { StatusBadge } from './StatusBadge'

/* ── Props ── */

interface LogListProps {
  logs: AdminLogItem[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onSelectLog: (id: number | null) => void
}

/* ── Table ── */

const COLUMNS = [
  { key: 'id', label: 'ID', className: '' },
  { key: 'user', label: '用户', className: '' },
  { key: 'model', label: '模型', className: '' },
  { key: 'vendor', label: '供应商', className: '' },
  { key: 'promptTokens', label: '提示 Token', className: 'text-right' },
  { key: 'completionTokens', label: '补全 Token', className: 'text-right' },
  { key: 'totalTokens', label: '总计 Token', className: 'text-right' },
  { key: 'cost', label: '消费', className: 'text-right' },
  { key: 'status', label: '状态', className: '' },
  { key: 'duration', label: '耗时', className: '' },
  { key: 'time', label: '时间', className: '' },
  { key: 'actions', label: '操作', className: '' },
] as const

export default function LogList({
  logs, loading, total, page, pageSize, totalPages,
  onPageChange, onPageSizeChange, onSelectLog,
}: LogListProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-sm font-medium text-slate-500 ${col.className}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <TableSkeleton rows={5} cols={12} />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-12 text-slate-400">
                  暂无调用日志数据
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50 transition cursor-pointer"
                  onClick={() => onSelectLog(log.id)}
                >
                  <td className="px-4 py-3 text-sm text-slate-600">{log.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{log.userEmail || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.modelName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.vendorName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {log.promptTokens?.toLocaleString() || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {log.completionTokens?.toLocaleString() || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">
                    {log.totalTokens?.toLocaleString() || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    ¥{Number(log.cost || 0).toFixed(6)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.durationMs}ms</td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectLog(log.id)
                      }}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition"
                    >
                      <Eye size={14} /> 详情
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
