// ── QuotaUsageChart — 使用率进度条 ──
// 接收使用百分比和告警阈值，渲染彩色进度条 + 百分比文字

import { useMemo } from 'react'

interface QuotaUsageChartProps {
  usedAmount: string | null
  quotaAmount: string
  alertPercent: string
}

export default function QuotaUsageChart({ usedAmount, quotaAmount, alertPercent }: QuotaUsageChartProps) {
  const usage = useMemo(() => {
    const used = parseFloat(usedAmount || '0')
    const total = parseFloat(quotaAmount)
    return total > 0 ? (used / total) * 100 : 0
  }, [usedAmount, quotaAmount])

  const threshold = useMemo(() => parseFloat(alertPercent) || 80, [alertPercent])

  const colorClass = useMemo(() => {
    if (usage >= 90) return 'text-red-600'
    if (usage >= threshold) return 'text-amber-600'
    return 'text-green-600'
  }, [usage, threshold])

  const barColor = useMemo(() => {
    if (usage >= 90) return 'bg-red-500'
    if (usage >= threshold) return 'bg-amber-500'
    return 'bg-green-500'
  }, [usage, threshold])

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, usage)}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${colorClass}`}>
        {usage.toFixed(1)}%
      </span>
    </div>
  )
}
