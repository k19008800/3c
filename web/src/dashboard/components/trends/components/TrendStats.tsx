import type { TrendStatsProps } from '../types'
import { calculateStats } from '../utils'

export default function TrendStats({ series }: TrendStatsProps) {
  if (series.length === 0) return null

  const { totalCalls, totalTokens, totalCost, avgSuccessRate } = calculateStats(series)

  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="bg-white rounded-lg border p-3">
        <div className="text-xs text-slate-600">总调用</div>
        <div className="text-lg font-bold">
          {totalCalls.toLocaleString()}
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3">
        <div className="text-xs text-slate-600">总Token</div>
        <div className="text-lg font-bold">
          {(totalTokens / 1_000_000).toFixed(2)}M
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3">
        <div className="text-xs text-slate-600">总成本</div>
        <div className="text-lg font-bold">
          ¥{totalCost.toFixed(2)}
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3">
        <div className="text-xs text-slate-600">平均成功率</div>
        <div className="text-lg font-bold">
          {avgSuccessRate.toFixed(1)}%
        </div>
      </div>
    </div>
  )
}