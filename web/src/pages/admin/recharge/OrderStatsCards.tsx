import { useMemo } from 'react'
import type { RechargeOrder } from '@/types'
import { Wallet, Clock, CheckCircle2, Receipt } from 'lucide-react'

interface OrderStatsCardsProps {
  orders: RechargeOrder[]
  total: number
  loading: boolean
}

interface Stats {
  /** 今日已确认充值总额 */
  todayConfirmed: number
  /** 待审核笔数（pending + 待复审的 bank_transfer） */
  pendingCount: number
  /** 已确认订单总金额 */
  totalConfirmed: number
  /** 总订单数 */
  totalOrders: number
}

function computeStats(orders: RechargeOrder[], total: number): Stats {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  let todayConfirmed = 0
  let pendingCount = 0
  let totalConfirmed = 0

  for (const o of orders) {
    // 待审核：pending 状态，或 bank_transfer 已初审待复审
    if (o.status === 'pending') {
      if (o.channel !== 'bank_transfer' || !o.firstConfirmedBy) {
        pendingCount++
      }
    }
    if (o.channel === 'bank_transfer' && o.firstConfirmedBy && !o.secondConfirmedBy) {
      pendingCount++
    }

    // 已确认金额
    if (o.status === 'confirmed') {
      totalConfirmed += Number(o.amount) || 0
      if (o.createdAt?.startsWith(todayStr)) {
        todayConfirmed += Number(o.amount) || 0
      }
    }
  }

  return {
    todayConfirmed,
    pendingCount,
    totalConfirmed,
    totalOrders: total,
  }
}

const cardClass =
  'bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex items-start gap-3 transition hover:shadow-md'

export default function OrderStatsCards({ orders, total, loading }: OrderStatsCardsProps) {
  const stats = useMemo(() => computeStats(orders, total), [orders, total])

  const items = [
    {
      label: '今日充值额',
      value: `¥${stats.todayConfirmed.toFixed(2)}`,
      icon: Wallet,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '待审核',
      value: `${stats.pendingCount} 笔`,
      icon: Clock,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: '已确认总额',
      value: `¥${stats.totalConfirmed.toFixed(2)}`,
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: '总订单数',
      value: `${stats.totalOrders} 笔`,
      icon: Receipt,
      color: 'text-slate-600 bg-slate-50',
    },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {items.map((_, i) => (
          <div key={i} className="bg-slate-100 rounded-xl p-4 h-20" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.label} className={cardClass}>
            <div className={`p-2 rounded-lg ${item.color}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 truncate">{item.label}</p>
              <p className="text-lg font-semibold text-slate-900 mt-0.5">{item.value}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
