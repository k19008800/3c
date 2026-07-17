import { useRef, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import type { RechargeOrder } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import type { ReviewAction } from './OrderListUtils'
import { StatusBadge, getActions, actionIconMap, AmountBar } from './OrderListUtils'

interface OrderListProps {
  orders: RechargeOrder[]
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
  onOpenReview: (mode: ReviewAction['mode'], order: RechargeOrder) => void
}

function ReviewCell({ order, onOpenReview }: { order: RechargeOrder; onOpenReview: (mode: ReviewAction['mode'], order: RechargeOrder) => void }) {
  const actions = getActions(order)
  if (actions.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      {actions.map((btn) => (
        <button
          key={btn.mode}
          onClick={() => onOpenReview(btn.mode, order)}
          className={`text-sm font-medium ${btn.className}`}
        >
          {actionIconMap[btn.mode]}
          {btn.label}
        </button>
      ))}
    </div>
  )
}

function ChannelLabel({ order }: { order: RechargeOrder }) {
  if (order.channel === 'bank_transfer') {
    return (
      <span title={`${order.bankName ?? ''} ${order.accountNumber ?? ''}`}>
        银行转账
        {(order.bankName || order.accountNumber) && (
          <span className="block text-xs text-slate-400 font-mono truncate max-w-[140px]">
            {order.bankName} {order.accountNumber?.slice(-4) ? `(${order.accountNumber.slice(-4)})` : ''}
          </span>
        )}
      </span>
    )
  }
  return <>{order.channel === 'wechat_scan' ? '微信支付' : order.channel === 'alipay_scan' ? '支付宝' : order.channel}</>
}

function ReviewProgress({ order }: { order: RechargeOrder }) {
  if (order.channel !== 'bank_transfer') {
    return <span className="text-slate-400">-</span>
  }
  if (order.status === 'confirmed') {
    return <span className="text-green-600">初审 ✔ 复审 ✔</span>
  }
  if (order.firstConfirmedBy) {
    return <span className="text-sky-600">初审 ✔ 待复审</span>
  }
  if (order.status === 'pending') {
    return <span className="text-yellow-600">待初审</span>
  }
  return <span className="text-slate-400">-</span>
}

export default function OrderList({
  orders, total, loading, page, pageSize, totalPages,
  batchMode, selectedIds,
  onToggleSelect, onToggleSelectAll,
  onPageChange, onPageSizeChange, onOpenReview,
}: OrderListProps) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const maxAmount = useMemo(() => Math.max(...orders.map((o) => Number(o.amount) || 0), 0), [orders])
  const colCount = batchMode ? 11 : 10

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin" size={24} /></div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="text-center py-16 text-slate-400">暂无充值订单</div>
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
                  <input type="checkbox" ref={selectAllRef} checked={orders.length > 0 && selectedIds.size === orders.length} onChange={onToggleSelectAll} className="rounded border-slate-300" />
                </th>
              )}
              <th className="px-4 py-3 text-sm font-medium text-slate-500">订单号</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">余额趋势</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">方式</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">审核进度</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">凭证号</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orders.map((order) => (
              <tr key={order.id} className={'hover:bg-slate-50 transition ' + (selectedIds.has(order.id) ? 'bg-blue-50' : '')}>
                {batchMode && (
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => onToggleSelect(order.id)} className="rounded border-slate-300" />
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-slate-600 font-mono max-w-[160px] truncate" title={order.orderNo}>{order.orderNo}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <div className="truncate max-w-[120px]" title={order.userNickname || order.userEmail || ''}>
                    {order.userNickname || order.userEmail || `ID:${order.userId}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">¥{Number(order.amount || 0).toFixed(2)}</td>
                <td className="px-4 py-3"><AmountBar amount={Number(order.amount) || 0} maxAmount={maxAmount} /></td>
                <td className="px-4 py-3 text-sm text-slate-600"><ChannelLabel order={order} /></td>
                <td className="px-4 py-3"><StatusBadge order={order} /></td>
                <td className="px-4 py-3 text-xs text-slate-500"><ReviewProgress order={order} /></td>
                <td className="px-4 py-3 text-sm text-slate-500 font-mono">{order.voucherNo || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3"><ReviewCell order={order} onOpenReview={onOpenReview} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <PaginationBar page={page} onPageChange={onPageChange} pageSize={pageSize} onPageSizeChange={onPageSizeChange} total={total} totalPages={totalPages} />
      )}
    </div>
  )
}
