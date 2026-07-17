// ============================================================
//  AnnounceStats — 公告统计 + MiniChart
// ============================================================

import { useMemo } from 'react'
import MiniChart from '@/components/ui/MiniChart'
import type { Announcement } from './types'

interface AnnounceStatsProps {
  announcements: Announcement[]
  loading: boolean
}

export default function AnnounceStats({ announcements, loading }: AnnounceStatsProps) {
  const { total, published, draft } = useMemo(() => {
    const t = announcements.length
    const p = announcements.filter((a) => a.status).length
    return { total: t, published: p, draft: t - p }
  }, [announcements])

  const chartData = useMemo(() => {
    // Group by day for trend: last 7 days, count by day
    const now = Date.now()
    const dayMs = 86400000
    const days: { label: string; value: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * dayMs)
      const label = `${d.getMonth() + 1}/${d.getDate()}`
      const count = announcements.filter((a) => {
        const created = new Date(a.createdAt).getTime()
        return created >= now - (i + 1) * dayMs && created < now - i * dayMs
      }).length
      days.push({ label, value: count })
    }
    return days
  }, [announcements])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
            <div className="h-7 w-12 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Total */}
      <StatCard label="全部公告" value={total} color="indigo" />
      {/* Published */}
      <StatCard label="已发布" value={published} color="green" />
      {/* Draft / Inactive */}
      <StatCard label="已下架" value={draft} color="slate" />

      {/* Mini trend chart */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-center">
        <span className="text-xs font-medium text-slate-500 mb-1">近 7 天发布趋势</span>
        <div className="flex items-end gap-1 h-10">
          {chartData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full bg-indigo-400 rounded-t"
                style={{
                  height: `${Math.max(2, d.value * 8)}px`,
                  opacity: 0.5 + (i / chartData.length) * 0.5,
                }}
              />
              {chartData.length <= 8 && (
                <span className="text-[9px] text-slate-400">{d.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'indigo' | 'green' | 'slate'
}) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-green-50 text-green-700',
    slate: 'bg-slate-50 text-slate-600',
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  )
}
