import { useMemo } from 'react'
import React from 'react';
import {Package, Hash, Users, DollarSign, Loader2,
} from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import type { RedemptionStats } from './types'

// ── Mini stat card ──

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: any
  label: string
  value: string
  sub?: string
  color: string
}) {
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

// ── Props ──

interface StatsCardsProps {
  stats: RedemptionStats | null
  loading: boolean
}

// ── Generate trend data for MiniChart ──

function useTrendData(stats: RedemptionStats | null): {
  usageData: MiniChartDataPoint[]
  amountData: MiniChartDataPoint[]
  userData: MiniChartDataPoint[]
} {
  return useMemo(() => {
    if (!stats) return { usageData: [], amountData: [], userData: [] }
    return {
      usageData: [
        { value: stats.totalCodes - stats.usedCodes, label: '未使用' },
        { value: stats.usedCodes, label: '已使用' },
      ],
      amountData: [
        { value: stats.totalRedeemed, label: '兑换次数' },
        { value: stats.totalUsers, label: '用户数' },
      ],
      userData: [
        { value: stats.totalBatches, label: '批次' },
        { value: stats.activeBatches, label: '活跃' },
      ],
    }
  }, [stats])
}

// ── Stats Cards Panel ──

const StatsCardsBase = React.memo(function StatsCardsBase({ stats, loading }: StatsCardsProps) {
  const { usageData, amountData, userData } = useTrendData(stats)

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="col-span-4 flex justify-center py-8">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </div>
    )
  }

  if (!stats) return null

  const usageRate = stats.totalCodes > 0
    ? ((stats.usedCodes / stats.totalCodes) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Package}
          label="总批次数"
          value={String(stats.totalBatches)}
          sub={`活跃 ${stats.activeBatches}`}
          color="bg-purple-500"
        />
        <StatCard
          icon={Hash}
          label="总码数"
          value={String(stats.totalCodes)}
          sub={`已用 ${stats.usedCodes} / 使用率 ${usageRate}%`}
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
          value={`￥${Number(stats.totalAmount).toFixed(2)}`}
          color="bg-orange-500"
        />
      </div>

      {/* Mini trend charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-2">码使用分布</p>
          <MiniChart
            data={usageData}
            type="bar"
            width={160}
            height={40}
            color="#3b82f6"
            gradient={false}
          />
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-2">兑换活跃度</p>
          <MiniChart
            data={amountData}
            type="bar"
            width={160}
            height={40}
            color="#10b981"
            gradient={false}
          />
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-2">批次活跃度</p>
          <MiniChart
            data={userData}
            type="bar"
            width={160}
            height={40}
            color="#8b5cf6"
            gradient={false}
          />
        </div>
      </div>
    </div>
  )
}

export default StatsCardsBase;
