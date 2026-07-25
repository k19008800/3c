import { DollarSign, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { fmt } from '../utils'
import type { CommissionRollupRow } from '@/types'

interface CommissionStatsProps {
  rows: CommissionRollupRow[]
}

export default function CommissionStats({ rows }: CommissionStatsProps) {
  const calculateStats = () => {
    const stats = {
      totalCommission: 0,
      settledAmount: 0,
      pendingAmount: 0,
      totalRecords: rows.length,
      pendingCount: 0,
      settledCount: 0,
    }

    rows.forEach(row => {
      stats.totalCommission += Number(row.totalCommissionAmount) || 0
      stats.settledAmount += Number(row.settledAmount) || 0
      stats.pendingAmount += Number(row.pendingAmount) || 0
      if (row.pendingCount > 0) {
        stats.pendingCount++
      } else {
        stats.settledCount++
      }
    })

    return stats
  }

  const stats = calculateStats()

  const statCards = [
    {
      title: '总佣金',
      value: fmt(stats.totalCommission),
      description: `共 ${stats.totalRecords} 条记录`,
      icon: DollarSign,
      color: 'bg-blue-50 text-blue-600 border-blue-100',
    },
    {
      title: '已结算',
      value: fmt(stats.settledAmount),
      description: `${stats.settledCount} 条已结算`,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-600 border-green-100',
    },
    {
      title: '待结算',
      value: fmt(stats.pendingAmount),
      description: `${stats.pendingCount} 条待结算`,
      icon: Clock,
      color: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    },
    {
      title: '结算率',
      value: stats.totalRecords > 0 ? `${((stats.settledCount / stats.totalRecords) * 100).toFixed(1)}%` : '0%',
      description: '已结算比例',
      icon: TrendingUp,
      color: 'bg-purple-50 text-purple-600 border-purple-100',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className={`${stat.color} border rounded-xl p-4`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">{stat.title}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.description}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/50">
              <stat.icon size={20} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}