import type { VendorStats } from './types'
import VendorStatsCards from './VendorStatsCards'
import ModelPerformance from './ModelPerformance'

interface Props {
  stats: VendorStats | null
}

/**
 * RevenuePanel — 收入面板
 * 整合统计卡片与模型表现，展示供应商收入概况
 */
export default function RevenuePanel({ stats }: Props) {
  if (!stats) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">暂无统计数据</div>
    )
  }

  return (
    <div className="space-y-4">
      <VendorStatsCards stats={stats} />
      <ModelPerformance modelStats={stats.modelStats || []} />
    </div>
  )
}
