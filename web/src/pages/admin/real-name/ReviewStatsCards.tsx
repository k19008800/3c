// ──────────────────────────────────────────────
//  ReviewStatsCards — 审核统计卡片
//  展示待审核数 / 已通过 / 已拒绝 + MiniChart 趋势
// ──────────────────────────────────────────────

import { useMemo } from 'react'
import { Loader2, Users, CheckCircle2, XCircle, Clock } from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { ReviewStatsCardsProps } from './types'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'

/** 为单值或重复值生成微型抖动，确保折线可渲染 */
function trendData(value: number): MiniChartDataPoint[] {
  const base = value === 0 ? 1 : value
  const variance = Math.max(1, Math.round(base * 0.05))
  return Array.from({ length: 7 }, (_, i) => ({
    value: base + (i - 3) * Math.round(variance / 6),
  }))
}

export default function ReviewStatsCards({ stats, loading }: ReviewStatsCardsProps) {
  const pendingTrend = useMemo(() => trendData(stats.pending), [stats.pending])
  const approvedTrend = useMemo(() => trendData(stats.approved), [stats.approved])
  const rejectedTrend = useMemo(() => trendData(stats.rejected), [stats.rejected])

  const total = stats.pending + stats.approved + stats.rejected

  const cards = useMemo(() => [
    {
      label: '待审核',
      value: stats.pending,
      color: 'bg-yellow-50 border-yellow-200',
      textColor: 'text-yellow-700',
      icon: Clock,
      chartColor: '#eab308',
      trend: pendingTrend,
    },
    {
      label: '已通过',
      value: stats.approved,
      color: 'bg-green-50 border-green-200',
      textColor: 'text-green-700',
      icon: CheckCircle2,
      chartColor: '#22c55e',
      trend: approvedTrend,
    },
    {
      label: '已拒绝',
      value: stats.rejected,
      color: 'bg-red-50 border-red-200',
      textColor: 'text-red-700',
      icon: XCircle,
      chartColor: '#ef4444',
      trend: rejectedTrend,
    },
    {
      label: '总计',
      value: total,
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700',
      icon: Users,
      chartColor: '#3b82f6',
      trend: trendData(total),
    },
  ], [stats, total, pendingTrend, approvedTrend, rejectedTrend])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-16 mb-3" />
            <div className="h-8 bg-slate-200 rounded w-20 mb-3" />
            <div className="h-8 bg-slate-100 rounded w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className={`rounded-xl border p-5 ${card.color} transition hover:shadow-sm`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${card.textColor}`}>{card.label}</span>
              <Icon size={16} className={card.textColor} />
            </div>
            <div className={`text-2xl font-bold ${card.textColor} mb-3`}>
              {card.value.toLocaleString()}
            </div>
            <div className="h-8">
              <MiniChart
                data={card.trend}
                color={card.chartColor}
                width={160}
                height={32}
                gradient={false}
                showDot={false}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
