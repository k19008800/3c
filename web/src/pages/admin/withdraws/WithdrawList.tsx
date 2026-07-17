import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import type { WithdrawRecord } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'

const statusClassMap: Record<string, string> = {
  pending_first_review: 'bg-yellow-100 text-yellow-700',
  pending_second_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-violet-100 text-violet-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const statusLabelMap: Record<string, string> = {
  pending_first_review: '待初审',
  pending_second_review: '待复审',
  approved: '已通过',
  paid: '已打款',
  rejected: '已拒绝',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClassMap[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {statusLabelMap[status] || status}
    </span>
  )
}


interface WithdrawListProps {
  rows: WithdrawRecord[]
  total: number
  loading: boolean
  page: number
  pageSize: number
  totalPages: number
  batchMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (id: number) => void
  onToggleSelectAll: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onAction: (id: number, kind: 'first-review' | 'second-review' | 'mark-paid') => void
}

function ActionCell({
  id,
  status,
  onAction,
}: {
  id: number
  status: string
  onAction: (id: number, kind: 'first-review' | 'second-review' | 'mark-paid') => void
}) {
  if (status === 'pending_first_review') {
    return (
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => onAction(id, 'first-review')}
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          初审通过
        </button>
        <button
          onClick={() => onAction(id, 'first-review')}
          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          拒绝
        </button>
      </div>
    )
  }
  if (status === 'pending_second_review') {
    return (
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => onAction(id, 'second-review')}
          className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          复审通过
        </button>
        <button
          onClick={() => onAction(id, 'second-review')}
          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          拒绝
        </button>
      </div>
    )
  }
  if (status === 'approved') {
    return (
      <button
        onClick={() => onAction(id, 'mark-paid')}
        className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
      >
        标记已打款
      </button>
    )
  }
  return null
}

export default function WithdrawList({
  rows, total, loading, page, pageSize, totalPages,
  batchMode, selectedIds,
  onToggleSelect, onToggleSelectAll,
  onPageChange, onPageSizeChange, onAction,
}: WithdrawListProps) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const colCount = batchMode ? 10 : 9

  // ── Loading state ──
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="text-center py-16 text-slate-400">暂无提现订单</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              {batchMode && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    onChange={onToggleSelectAll}
                    className="rounded border-slate-300"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">代理商</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">手续费</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">实际到账</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">拒绝原因</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`hover:bg-slate-50 transition ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}
              >
                {batchMode && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggleSelect(r.id)}
                      className="rounded border-slate-300"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                <td className="px-4 py-3 text-sm text-slate-900">
                  {r.nickname || r.email || `#${r.userId}`}
                </td>
                <td className="px-4 py-3 text-sm font-medium">
                  ¥{Number(r.amount).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  ¥{Number(r.feeAmount || '0').toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm">
                  ¥{Number(r.actualAmount || r.amount).toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 max-w-[160px] truncate" title={r.rejectReason || ''}>
                  {r.rejectReason || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString('zh-CN')}
                </td>
                <td className="px-4 py-3">
                  <ActionCell id={r.id} status={r.status} onAction={onAction} />
                </td>
              </tr>
            ))}
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
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
