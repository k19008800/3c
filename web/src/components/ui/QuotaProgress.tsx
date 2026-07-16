/**
 * QuotaProgress — 配额进度条组件
 *
 * 展示在用户仪表盘，显示月度/总额度使用进度。
 *
 * @example
 * <QuotaProgress
 *   label="月度 Token"
 *   used={234567}
 *   total={1000000}
 *   periodEnd="2026-07-31"
 * />
 */

import { AlertTriangle } from 'lucide-react'

interface QuotaProgressProps {
  label: string
  used: number
  total: number
  periodEnd?: string
  size?: 'sm' | 'md'
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}

export default function QuotaProgress({
  label,
  used,
  total,
  periodEnd,
  size = 'sm',
}: QuotaProgressProps) {
  if (total <= 0) return null

  const pct = Math.min(100, Math.round((used / total) * 100))
  const remaining = Math.max(0, total - used)
  const isExceeded = used >= total
  const isWarning = pct >= 80 && !isExceeded

  const barColor = isExceeded
    ? 'bg-red-500'
    : isWarning
      ? 'bg-amber-500'
      : 'bg-blue-500'

  const heightClass = size === 'md' ? 'h-3' : 'h-2'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          {isExceeded && (
            <span className="flex items-center gap-0.5 text-red-500 font-medium">
              <AlertTriangle size={11} />
              已超限
            </span>
          )}
          {isWarning && !isExceeded && (
            <span className="text-amber-500 font-medium">{pct}%</span>
          )}
          {!isWarning && !isExceeded && (
            <span className="text-slate-400">{pct}%</span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${heightClass}`}>
        <div
          className={`${barColor} ${heightClass} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {fmtNum(used)} / {fmtNum(total)}
        </span>
        {periodEnd && (
          <span>
            剩余: {fmtNum(remaining)}
            {periodEnd && ` · ${new Date(periodEnd).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} 重置`}
          </span>
        )}
      </div>
    </div>
  )
}
