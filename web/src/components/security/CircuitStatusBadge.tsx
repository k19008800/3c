import { cn } from '@/lib/utils'

const statusMap = {
  closed: { label: '正常运行', className: 'bg-green-100 text-green-700' },
  open: { label: '熔断中', className: 'bg-red-100 text-red-700' },
  'half-open': { label: '半开探测', className: 'bg-yellow-100 text-yellow-700' },
} as const

export default function CircuitStatusBadge({ state }: { state: string }) {
  const cfg = statusMap[state as keyof typeof statusMap] || { label: state, className: 'bg-slate-100 text-slate-700' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full', cfg.className)}>
      {state === 'closed' ? '✅' : state === 'open' ? '⛔' : '⚠️'} {cfg.label}
    </span>
  )
}
