import { Gauge } from 'lucide-react'

export function LatencyBadge({ durationMs }: { durationMs: number | null }) {
  if (durationMs == null) return <span className="text-xs text-slate-400">-</span>

  let color: string
  let bg: string
  if (durationMs < 500) {
    color = 'text-green-700'
    bg = 'bg-green-100'
  } else if (durationMs < 2000) {
    color = 'text-amber-700'
    bg = 'bg-amber-100'
  } else {
    color = 'text-red-700'
    bg = 'bg-red-100'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${bg} ${color}`}>
      <Gauge size={10} />
      {durationMs}ms
    </span>
  )
}