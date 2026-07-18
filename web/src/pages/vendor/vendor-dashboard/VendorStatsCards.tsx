import { useMemo } from 'react'
import { Activity, Zap, DollarSign, BarChart3 } from 'lucide-react'
import { fmtCost, fmtTokens } from './types'

interface StatsData {
  totalCalls: number
  todayCalls: number
  totalRevenue: string
  totalTokens?: number
}

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: any
}) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon size={16} className="text-slate-400" />
      </div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

interface Props {
  stats: StatsData
}

export default function VendorStatsCards({ stats }: Props) {
  const cards = useMemo(() => [
    { label: '总调用次数', value: stats.totalCalls.toLocaleString(), icon: Activity, color: 'border-blue-200 bg-blue-50' },
    { label: '今日调用', value: stats.todayCalls.toLocaleString(), icon: Zap, color: 'border-purple-200 bg-purple-50' },
    { label: '总营收', value: fmtCost(stats.totalRevenue), icon: DollarSign, color: 'border-green-200 bg-green-50' },
    { label: '总 Token', value: fmtTokens(stats.totalTokens || 0), icon: BarChart3, color: 'border-amber-200 bg-amber-50' },
  ], [stats])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  )
}
