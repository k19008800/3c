// ── QuotaStatsCards — 配额统计卡片 ──
// 展示总配额数、生效中、已过期、总额度金额

import { useMemo } from 'react'
import { Gauge, CheckCircle2, Calendar, DollarSign } from 'lucide-react'

interface QuotaStatsCardsProps {
  totalQuotas: number
  activeCount: number
  expiredCount: number
  totalAmount: number
  loading: boolean
}

interface StatItem {
  label: string
  value: string | number
  icon: React.FC<{ size?: number; className?: string }>
  color: string
  bg: string
}

export default function QuotaStatsCards({
  totalQuotas,
  activeCount,
  expiredCount,
  totalAmount,
  loading,
}: QuotaStatsCardsProps) {
  const stats: StatItem[] = useMemo(
    () => [
      {
        label: '总配额数',
        value: totalQuotas,
        icon: Gauge,
        color: 'text-indigo-600',
        bg: 'bg-indigo-50',
      },
      {
        label: '生效中',
        value: activeCount,
        icon: CheckCircle2,
        color: 'text-green-600',
        bg: 'bg-green-50',
      },
      {
        label: '已过期',
        value: expiredCount,
        icon: Calendar,
        color: 'text-slate-600',
        bg: 'bg-slate-50',
      },
      {
        label: '总额度金额',
        value: `￥${totalAmount.toFixed(2)}`,
        icon: DollarSign,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
      },
    ],
    [totalQuotas, activeCount, expiredCount, totalAmount],
  )

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex items-center gap-3"
          >
            <div className={`${stat.bg} p-2.5 rounded-lg`}>
              <Icon size={20} className={stat.color} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
