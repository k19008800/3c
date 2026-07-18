import { Loader2 } from 'lucide-react'
import { Package, Hash, Users, DollarSign } from 'lucide-react'
import type { RedemptionStats } from './types'

interface StatCardProps {
  icon: any
  label: string
  value: string
  sub?: string
  color: string
}

export function StatCard({ icon: Icon, label, value, sub, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  )
}

interface Props {
  loading: boolean
  stats: RedemptionStats | null
}

export default function RedemptionStatsCards({ loading, stats }: Props) {
  if (loading) {
    return (
      <div className="col-span-4 flex justify-center py-8">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (!stats) return null

  return (
    <>
      <StatCard
        icon={Package}
        label="总批次"
        value={String(stats.totalBatches)}
        sub={`活跃 ${stats.activeBatches}`}
        color="bg-purple-500"
      />
      <StatCard
        icon={Hash}
        label="总码数"
        value={String(stats.totalCodes)}
        sub={`已用 ${stats.usedCodes}`}
        color="bg-blue-500"
      />
      <StatCard
        icon={Users}
        label="兑换用户数"
        value={String(stats.totalUsers)}
        sub={`兑换次数 ${stats.totalRedeemed}`}
        color="bg-green-500"
      />
      <StatCard
        icon={DollarSign}
        label="兑换总额"
        value={`¥${Number(stats.totalAmount).toFixed(2)}`}
        color="bg-orange-500"
      />
    </>
  )
}
