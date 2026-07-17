import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, post } from '@/lib/api'
import type { WithdrawOrder, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import { TableSkeleton } from '@/components/ui/skeleton'
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'

/* ═══════════════════════════════════════
   Status helpers
   ═══════════════════════════════════════ */

const STATUS_CLASSES: Record<string, string> = {
  pending_review: 'bg-orange-100 text-orange-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  paid: '已付款',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_CLASSES[status] || 'bg-slate-100 text-slate-500'
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  )
}

/* ═══════════════════════════════════════
   Props
   ═══════════════════════════════════════ */

interface WithdrawOrdersProps {
  onStatsChange?: () => void
}

/* ═══════════════════════════════════════
   Withdraw Orders
   ═══════════════════════════════════════ */

export default function WithdrawOrders({ onStatsChange }: WithdrawOrdersProps) {
  const [orders, setOrders] = useState<WithdrawOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reviewingOrder, setReviewingOrder] = useState<WithdrawOrder | null>(null)

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<WithdrawOrder>>(
        '/api/v1/admin/withdraws',
        params
      )
      setOrders(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取提现订单失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleRefresh = useCallback(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleFilterChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [])

  const handleReviewed = useCallback(() => {
    setReviewingOrder(null)
    fetchOrders()
    onStatsChange?.()
  }, [fetchOrders, onStatsChange])

  return (
    <>
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending_review">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
              <option value="paid">已付款</option>
            </select>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">提现金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">申请时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">处理时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无提现订单
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{o.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {o.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {o.nickname || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      ¥{Number(o.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {o.reviewedAt
                        ? new Date(o.reviewedAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === 'pending_review' ? (
                        <button
                          onClick={() => setReviewingOrder(o)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          审核
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Review Modal */}
      {reviewingOrder && (
        <ReviewModal
          order={reviewingOrder}
          onClose={handleReviewed}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════
   Review Modal
   ═══════════════════════════════════════ */

function ReviewModal({
  order,
  onClose,
}: {
  order: WithdrawOrder
  onClose: () => void
}) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!action) return
    if (action === 'reject' && !rejectReason.trim()) {
      setMessage('拒绝时请填写原因')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const body: any = { action }
      if (action === 'reject') body.rejectReason = rejectReason.trim()
      await post(`/api/v1/admin/withdraws/${order.id}/review`, body)
      onClose()
    } catch (err: any) {
      setMessage(err.message || '审核操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">审核提现</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
                message.includes('失败')
                  ? 'bg-red-50 text-red-600'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">订单ID：</span>
              {order.id}
            </div>
            <div>
              <span className="text-slate-500">代理邮箱：</span>
              {order.email || '-'}
            </div>
            <div>
              <span className="text-slate-500">代理昵称：</span>
              {order.nickname || '-'}
            </div>
            <div>
              <span className="text-slate-500">金额：</span>
              ¥{Number(order.amount || 0).toFixed(2)}
            </div>
            <div>
              <span className="text-slate-500">申请时间：</span>
              {order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('zh-CN')
                : '-'}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-2">操作</label>
            <div className="flex gap-3">
              <button
                onClick={() => { setAction('approve'); setRejectReason('') }}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                  action === 'approve'
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 size={16} className="inline mr-1" />
                通过
              </button>
              <button
                onClick={() => setAction('reject')}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition ${
                  action === 'reject'
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                拒绝
              </button>
            </div>
          </div>

          {action === 'reject' && (
            <div>
              <label className="block text-sm text-slate-700 mb-1">拒绝原因</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="请输入拒绝原因"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !action}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              确认提交
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
