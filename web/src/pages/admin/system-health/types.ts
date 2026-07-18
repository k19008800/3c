/* ── SystemHealthPanel shared helpers ── */

export function fmtDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' ') || '<1m'
}

export function healthColor(score: string): string {
  const n = parseFloat(score)
  if (n >= 0.85) return 'text-green-600 bg-green-50'
  if (n >= 0.7) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

export function rateLimitPct(current: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(Math.round((current / limit) * 100), 100)
}

export function rateLimitColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}
