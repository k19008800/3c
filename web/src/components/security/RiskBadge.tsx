import { cn } from '@/lib/utils'

const riskConfig = {
  low: { label: '低风险', className: 'bg-green-100 text-green-700 border-green-200' },
  medium: { label: '中风险', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  high: { label: '高风险', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  critical: { label: '严重', className: 'bg-red-100 text-red-700 border-red-200' },
} as const

export default function RiskBadge({ level }: { level: string }) {
  const cfg = riskConfig[level as keyof typeof riskConfig] || riskConfig.low
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border', cfg.className)}>
      {cfg.label}
    </span>
  )
}
