/**
 * CommissionStatsPanel - 佣金统计面板
 * 从 FinanceCommissions.tsx 拆分
 */
import { memo } from 'react'
import { BarChart3, PieChart, TrendingUp, DollarSign } from 'lucide-react'

interface CommissionStats {
  totalCommission: number
  settledCommission: number
  pendingCommission: number
  totalRecords: number
  settledRecords: number
  pendingRecords: number
}

interface CommissionStatsPanelProps {
  stats: CommissionStats
  loading?: boolean
}

function CommissionStatsPanel({ stats, loading }: CommissionStatsPanelProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-6 bg-gray-200 rounded w-3/4" />
          </div>
        ))}
      </div>
    )
  }

  const settlementRate = stats.totalCommission > 0
    ? ((stats.settledCommission / stats.totalCommission) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* 总佣金 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
          <DollarSign className="w-4 h-4" />
          <span>总佣金</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          ¥{stats.totalCommission.toFixed(2)}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {stats.totalRecords} 笔记录
        </div>
      </div>

      {/* 已结算 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
          <TrendingUp className="w-4 h-4" />
          <span>已结算</span>
        </div>
        <div className="text-2xl font-bold text-green-600">
          ¥{stats.settledCommission.toFixed(2)}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {stats.settledRecords} 笔
        </div>
      </div>

      {/* 待结算 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
          <PieChart className="w-4 h-4" />
          <span>待结算</span>
        </div>
        <div className="text-2xl font-bold text-orange-600">
          ¥{stats.pendingCommission.toFixed(2)}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {stats.pendingRecords} 笔
        </div>
      </div>

      {/* 结算率 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
          <BarChart3 className="w-4 h-4" />
          <span>结算率</span>
        </div>
        <div className="text-2xl font-bold text-blue-600">
          {settlementRate}%
        </div>
        <div className="text-xs text-slate-500 mt-1">
          已结算 / 总佣金
        </div>
      </div>
    </div>
  )
}

export default memo(CommissionStatsPanel)
