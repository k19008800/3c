import { useMemo } from 'react'
import type { RefundItem } from './types'

interface Props {
  list: RefundItem[]
}

export default function RefundStatsCards({ list }: Props) {
  const stats = useMemo(() => {
    const counts = { pending: 0, approved: 0, completed: 0, rejected: 0 }
    let totalAmount = 0
    list.forEach((item) => {
      if (item.status in counts) {
        (counts as any)[item.status]++
      }
      totalAmount += Number(item.amount)
    })
    return { counts, totalAmount }
  }, [list])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="待审核" value={stats.counts.pending} color="text-yellow-600" bg="bg-yellow-50" />
      <StatCard label="已通过" value={stats.counts.approved} color="text-blue-600" bg="bg-blue-50" />
      <StatCard label="已完成" value={stats.counts.completed} color="text-green-600" bg="bg-green-50" />
      <StatCard label="已拒绝" value={stats.counts.rejected} color="text-red-600" bg="bg-red-50" />
    </div>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl p-4 ${bg} border border-slate-200`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
