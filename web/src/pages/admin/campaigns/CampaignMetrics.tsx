// ============================================================
//  CampaignMetrics.tsx — 活动效果指标 + MiniChart 趋势
// ============================================================

import { useEffect, useState, useMemo } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get } from '@/lib/api'
import MiniChart from '@/components/ui/MiniChart'
import type { CampaignDetailStats } from './types'

interface CampaignMetricsProps {
  campaignId: number
}

/** 固定高度的趋势数据点 */
interface TrendPoint {
  value: number
  label?: string
}

function StatCard({
  label,
  value,
  chartData,
}: {
  label: string
  value: string
  chartData?: TrendPoint[]
}) {
  return (
    <div className="rounded-lg p-5 bg-slate-50 border border-slate-100">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mb-2">{value}</p>
      {chartData && chartData.length > 0 && (
        <div className="pt-2 border-t border-slate-200">
          <MiniChart
            data={chartData}
            width={160}
            height={28}
            gradient={false}
            color="#6366f1"
          />
        </div>
      )}
    </div>
  )
}

export default function CampaignMetrics({ campaignId }: CampaignMetricsProps) {
  const [stats, setStats] = useState<CampaignDetailStats | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [statsData, trendData] = await Promise.all([
          get<CampaignDetailStats>(
            `/api/v1/admin/campaigns/${campaignId}/stats`,
          ),
          get<{ list: TrendPoint[] }>(
            `/api/v1/admin/campaigns/${campaignId}/trend`,
          ).catch(() => ({ list: [] as TrendPoint[] })),
        ])
        if (!cancelled) {
          setStats(statsData)
          setTrend(trendData?.list || [])
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || '获取活动统计数据失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // 拆分趋势数据用于不同指标
  const participantTrend = useMemo(() => trend, [trend])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 flex justify-center">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">活动效果</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="参与用户数"
          value={stats.participantCount.toLocaleString()}
          chartData={participantTrend}
        />
        <StatCard
          label="兑换率"
          value={`${(stats.redeemRate * 100).toFixed(1)}%`}
        />
        <StatCard
          label="产生的佣金"
          value={`¥${stats.totalCommission.toFixed(2)}`}
        />
        <StatCard
          label="ROI"
          value={`${(stats.roi * 100).toFixed(1)}%`}
        />
      </div>
    </div>
  )
}
