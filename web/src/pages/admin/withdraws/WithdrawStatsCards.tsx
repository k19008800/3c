import { useMemo } from 'react'
import type { WithdrawRecord } from '@/types'
import { Wallet, Clock, CheckCircle2, Banknote } from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { WithdrawStats } from './types'

interface WithdrawStatsCardsProps {
  rows: WithdrawRecord[]
  loading: boolean
}

function computeStats(rows: WithdrawRecord[]): WithdrawStats {
  let pendingFirstReview = 0
  let pendingSecondReview = 0
  let totalAmount = 0
  let totalPaid = 0
  const dailySums: Record<string, number> = {}

  for (const r of rows) {
    const amt = Number(r.amount) || 0
    totalAmount += amt

    if (r.status === 'pending_first_review') pendingFirstReview++
    if (r.status === 'pending_second_review') pendingSecondReview++
    if (r.status === 'paid') totalPaid += amt

    const day = r.createdAt?.slice(0, 10)
    if (day) {
      dailySums[day] = (dailySums[day] || 0) + amt
    }
  }

  const sortedDays = Object.keys(dailySums).sort()
  const trend = sortedDays.map((d) => ({ value: dailySums[d] }))

  return { pendingFirstReview, pendingSecondReview, totalAmount, totalPaid, trend }
}

const cardClass =
  'bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex items-start gap-3 transition hover:shadow-md'

export default function WithdrawStatsCards({ rows, loading }: WithdrawStatsCardsProps) {
  const stats = useMemo(() => computeStats(rows), [rows])

  const items = [
    {
      label: '待初审',
      value: `${stats.pendingFirstReview} 笔`,
      icon: Clock,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: '待复审',
      value: `${stats.pendingSecondReview} 笔`,
      icon: CheckCircle2,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '提现总额',
      value: `¥${stats.totalAmount.toFixed(2)}`,
      icon: Wallet,
      color: 'text-violet-600 bg-violet-50',
    },
    {
      label: '已打款',
      value: `¥${stats.totalPaid.toFixed(2)}`,
      icon: Banknote,
      color: 'text-green-600 bg-green-50',
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
              {item.label === '提现总额' && stats.trend.length > 1 && (
                <div className="mt-1">
                  <MiniChart data={stats.trend} width={100} height={24} color="#8b5cf6" />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
