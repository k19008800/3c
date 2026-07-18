import { Loader2, RefreshCw } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { RefundItem } from './types'
import { statusLabel, statusColor, refundTypeLabel, STATUS_OPTIONS } from './types'

interface Props {
  list: RefundItem[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  statusFilter: string
  onPageChange: (page: number) => void
  onStatusFilterChange: (status: string) => void
  onRefresh: () => void
}

export default function RefundList({
  list, total, page, pageSize, loading,
  statusFilter, onPageChange, onStatusFilterChange, onRefresh,
}: Props) {
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-800">退款记录</h2>
          <select
            value={statusFilter}
            onChange={(e) => { onStatusFilterChange(e.target.value); onPageChange(1) }}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-slate-400">暂无退款记录</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-6 py-3 font-medium text-slate-500">ID</th>
                  <th className="px-6 py-3 font-medium text-slate-500 text-right">金额</th>
                  <th className="px-6 py-3 font-medium text-slate-500">类型</th>
                  <th className="px-6 py-3 font-medium text-slate-500">原因</th>
                  <th className="px-6 py-3 font-medium text-slate-500">关联调用</th>
                  <th className="px-6 py-3 font-medium text-slate-500">状态</th>
                  <th className="px-6 py-3 font-medium text-slate-500">提交时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {list.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">#{item.id}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-700">
                      ¥{Number(item.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {refundTypeLabel[item.refundType] || item.refundType}
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate" title={item.reason}>
                      {item.reason}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                      {item.callId || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[item.status] || 'bg-slate-100 text-slate-600'}`}>
                        {statusLabel[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <PaginationBar
              page={page}
              onPageChange={onPageChange}
              pageSize={pageSize}
              onPageSizeChange={() => {}}
              total={total}
              totalPages={totalPages}
            />
          )}
        </>
      )}
    </div>
  )
}
