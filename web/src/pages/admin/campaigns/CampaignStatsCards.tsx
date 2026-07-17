// ============================================================
//  CampaignStatsCards.tsx — 活动列表页统计卡片
//  含 MiniChart 展示活动数量趋势
// ============================================================

import { useMemo } from 'react'
import { BarChart3, CheckCircle2, DollarSign, Megaphone } from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import type { CampaignStats } from './types'

interface CampaignStatsCardsProps {
  stats: CampaignStats
  /** 可选趋势数据，传入后 MiniChart 展示在卡片下方 */
  trendData?: MiniChartDataPoint[]
  /** 趋势数据加载状态 */
  trendLoading?: boolean
}

/** 单个统计卡片 */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
  trend,
  trendLoading,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  color: string
  bg: string
  trend?: MiniChartDataPoint[]
  trendLoading?: boolean
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
          <Icon size={24} className={color} />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      </div>
      {trend && trend.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <MiniChart
            data={trend}
            width={200}
            height={28}
            gradient={false}
            loading={trendLoading}
            color={color.includes('text-') ? undefined : '#3b82f6'}
          />
        </div>
      )}
    </div>
  )
}

export default function CampaignStatsCards({
  stats,
  trendData,
  trendLoading = false,
}: CampaignStatsCardsProps) {
  // 如果有趋势数据，按维度和卡片拆分
  const activeTrend = useMemo(() => {
    if (!trendData) return undefined
    // 使用全部趋势数据展示在 「进行中」卡片
    return trendData
  }, [trendData])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={Megaphone}
        label="活动总数"
        value={String(stats.total)}
        color="text-indigo-600"
        bg="bg-indigo-50"
      />
      <StatCard
        icon={BarChart3}
        label="进行中"
        value={String(stats.active)}
        color="text-green-600"
        bg="bg-green-50"
        trend={activeTrend}
        trendLoading={trendLoading}
      />
      <StatCard
        icon={CheckCircle2}
        label="已结束"
        value={String(stats.ended)}
        color="text-blue-600"
        bg="bg-blue-50"
      />
      <StatCard
        icon={DollarSign}
        label="总预算"
        value={`￥${Number(stats.totalBudget).toLocaleString()}`}
        color="text-amber-600"
        bg="bg-amber-50"
      />
    </div>
  )
}
