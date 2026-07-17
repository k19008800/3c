// ── KeyStatsCards — 统计摘要卡片 ──
// 展示总 Key 数、活跃 Key 数、已禁用数、今日调用次数

import { useMemo } from 'react'
import { Key, Activity, AlertTriangle, BarChart3 } from 'lucide-react'

interface KeyStatsCardsProps {
  total: number
  activeCount: number
  disabledCount: number
  todayCalls: number
  loading: boolean
}

interface StatItem {
  label: string
  value: number
  icon: React.FC<{ size?: number; className?: string }>
  color: string
  bg: string
}

export default function KeyStatsCards({
  total,
  activeCount,
  disabledCount,
  todayCalls,
  loading,
}: KeyStatsCardsProps) {
  const stats: StatItem[] = useMemo(
    () => [
      {
        label: '总 Key 数',
        value: total,
        icon: Key,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
      },
      {
        label: '活跃 Key',
        value: activeCount,
        icon: Activity,
        color: 'text-green-600',
        bg: 'bg-green-50',
      },
      {
        label: '已禁用',
        value: disabledCount,
        icon: AlertTriangle,
        color: 'text-slate-600',
        bg: 'bg-slate-50',
      },
      {
        label: '今日调用',
        value: todayCalls,
        icon: BarChart3,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
      },
    ],
    [total, activeCount, disabledCount, todayCalls],
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
