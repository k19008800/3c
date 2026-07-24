import { TrendingUp, TrendingDown } from 'lucide-react'
import type { ProfitSummary } from '../types'
import { fmt, fmtPct, fmtChange } from '../types'

interface SummaryCardsProps {
  summary: ProfitSummary
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      label: '总收入',
      value: fmt(summary.totalRevenue),
      change: summary.revenueChange,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: '总成本',
      value: fmt(summary.totalCost),
      change: summary.costChange,
      icon: TrendingDown,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: '毛利润',
      value: fmt(summary.totalProfit),
      change: summary.profitChange,
      icon: TrendingUp,
      color: summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: summary.totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
    {
      label: '利润率',
      value: fmtPct(summary.marginRate),
      change: summary.marginChange,
      icon: TrendingUp,
      color: summary.marginRate >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: summary.marginRate >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        const changePositive = card.change >= 0

        return (
          <div key={card.label} className={`${card.bgColor} rounded-xl p-4`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">{card.label}</span>
              <Icon size={20} className={card.color} />
            </div>
            <div className="mt-2">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className={`text-xs mt-1 ${changePositive ? 'text-green-600' : 'text-red-600'}`}>
                {fmtChange(card.change)} 较上期
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}