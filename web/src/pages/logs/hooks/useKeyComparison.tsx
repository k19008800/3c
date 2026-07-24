import { Loader2 } from 'lucide-react'
import type { LogSummary } from '@/types'
import type { KeyComparisonData } from '../types'

export function useKeyComparison() {
  // ── Render comparison card ──
  const renderComparisonCard = (data: KeyComparisonData | null, label: string) => {
    if (!data) {
      return (
        <div className="flex-1 bg-slate-50 rounded-lg p-4 text-center text-sm text-slate-400">
          请选择 API Key
        </div>
      )
    }

    if (data.loading) {
      return (
        <div className="flex-1 bg-slate-50 rounded-lg p-4 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} />
        </div>
      )
    }

    if (data.error) {
      return (
        <div className="flex-1 bg-red-50 rounded-lg p-4 text-sm text-red-600">
          {data.error}
        </div>
      )
    }

    const s = data.summary
    return (
      <div className="flex-1 bg-slate-50 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-slate-800 truncate" title={data.keyName}>
          {data.keyName}
        </p>
        {s ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">总调用</span>
              <p className="font-semibold text-slate-800">{s.totalCalls.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-slate-400">成功率</span>
              <p className="font-semibold text-slate-800">{s.successRate.toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-slate-400">Token</span>
              <p className="font-semibold text-slate-800">{Number(s.totalTokens).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-slate-400">消费</span>
              <p className="font-semibold text-slate-800">¥{Number(s.totalCost).toFixed(4)}</p>
            </div>
            <div>
              <span className="text-slate-400">成功</span>
              <p className="font-semibold text-green-600">{s.successCalls.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-slate-400">失败</span>
              <p className="font-semibold text-red-600">{s.failedCalls.toLocaleString()}</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400">平均耗时</span>
              <p className="font-semibold text-slate-800">{s.avgDuration.toFixed(0)}ms</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">暂无数据</p>
        )}
      </div>
    )
  }

  return {
    renderComparisonCard,
  }
}