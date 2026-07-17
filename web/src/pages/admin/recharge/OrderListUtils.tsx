import { useMemo } from 'react'
import type { RechargeOrder } from '@/types'
import MiniChart from '@/components/ui/MiniChart'
import { Shield, ShieldCheck, Ban } from 'lucide-react'

// ── Action type ──

export interface ReviewAction {
  label: string
  mode: 'first-confirm' | 'second-confirm' | 'legacy-confirm' | 'cancel'
  className: string
}

// ── Status badge ──

export function StatusBadge({ order }: { order: RechargeOrder }) {
  const { status, channel, firstConfirmedBy, secondConfirmedBy } = order

  if (channel === 'bank_transfer' && status === 'pending') {
    if (firstConfirmedBy && !secondConfirmedBy) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
          <ShieldCheck size={12} /> 待复审
        </span>
      )
    }
    if (!firstConfirmedBy) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Shield size={12} /> 待初审
        </span>
      )
    }
  }

  const colorMap: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    expired: 'bg-slate-100 text-slate-500',
    cancelled: 'bg-slate-100 text-slate-500',
  }
  const labelMap: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    confirmed: '已确认',
    failed: '失败',
    expired: '已过期',
    cancelled: '已取消',
  }

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        colorMap[status] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {labelMap[status] || status}
    </span>
  )
}

// ── Action buttons generator ──

export function getActions(order: RechargeOrder): ReviewAction[] {
  const btns: ReviewAction[] = []
  const isBankTransfer = order.channel === 'bank_transfer'
  const isPending = order.status === 'pending'
  const isPaid = order.status === 'paid'

  if (isBankTransfer && isPending) {
    if (!order.firstConfirmedBy) {
      btns.push({ label: '初审', mode: 'first-confirm', className: 'text-blue-600 hover:text-blue-800' })
    } else if (!order.secondConfirmedBy) {
      btns.push({ label: '复审', mode: 'second-confirm', className: 'text-green-600 hover:text-green-800' })
    }
  }

  if (isPaid) {
    btns.push({ label: '确认到账', mode: 'legacy-confirm', className: 'text-green-600 hover:text-green-800' })
  }

  if (isPending && !order.firstConfirmedBy) {
    btns.push({ label: '取消', mode: 'cancel', className: 'text-red-500 hover:text-red-700' })
  }

  return btns
}

// ── Action button icons ──

export const actionIconMap: Record<string, React.ReactNode> = {
  'first-confirm': <Shield size={14} className="inline mr-0.5" />,
  'second-confirm': <ShieldCheck size={14} className="inline mr-0.5" />,
  cancel: <Ban size={14} className="inline mr-0.5" />,
}

// ── Amount bar (MiniChart wrapper) ──

export function AmountBar({ amount, maxAmount }: { amount: number; maxAmount: number }) {
  const data = useMemo(
    () => [{ value: maxAmount > 0 ? (amount / maxAmount) * 100 : 0 }],
    [amount, maxAmount],
  )
  return <MiniChart data={data} type="bar" width={80} height={24} color="#3b82f6" gradient={false} />
}
