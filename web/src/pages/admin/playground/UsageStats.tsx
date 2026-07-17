// ============================================================
//  UsageStats — Playground 使用统计 + MiniChart
// ============================================================

import { useMemo } from 'react'
import MiniChart from '@/components/ui/MiniChart'
import type { PlaygroundResponse } from './types'

interface UsageStatsProps {
  response: PlaygroundResponse | null
}

export default function UsageStats({ response }: UsageStatsProps) {
  const usage = response?.usage
  const hasData = Boolean(usage && (usage.prompt_tokens > 0 || usage.completion_tokens > 0))

  const chartData = useMemo(() => {
    if (!usage) return []
    return [
      { label: '输入', value: usage.prompt_tokens },
      { label: '输出', value: usage.completion_tokens },
    ]
  }, [usage])

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <p className="text-xs font-medium text-slate-500 mb-2">Token 用量</p>
        <p className="text-sm text-slate-400">发送请求后显示用量统计</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Token stats */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <p className="text-xs font-medium text-slate-500 mb-2">Token 用量</p>
        <div className="space-y-2">
          <MiniStat label="输入 (↗)" value={usage!.prompt_tokens} color="blue" />
          <MiniStat label="输出 (↘)" value={usage!.completion_tokens} color="green" />
          <MiniStat label="总计 (∑)" value={usage!.total_tokens} color="indigo" />
        </div>
      </div>

      {/* Mini chart */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <p className="text-xs font-medium text-slate-500 mb-2">Token 分布</p>
        <div className="flex items-center justify-center">
          <MiniChart
            data={chartData}
            width={140}
            height={60}
            type="bar"
            color="#6366f1"
            gradient={false}
          />
        </div>
        <div className="flex justify-center gap-4 mt-1 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-400" /> 输入</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-400" /> 输出</span>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    indigo: 'text-indigo-700',
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${colorMap[color] || 'text-slate-700'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  )
}
