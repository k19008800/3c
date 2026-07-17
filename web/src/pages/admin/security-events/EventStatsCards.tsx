import { useEffect, useState } from 'react'
import { get } from '@/lib/api'
import type { SecurityDashboardData } from '@/types'
import MiniChart from '@/components/ui/MiniChart'
import { AlertCircle, Loader2, ShieldAlert, AlertTriangle, Eye } from 'lucide-react'

interface StatCard {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  bgColor: string
}

export default function EventStatsCards() {
  const [data, setData] = useState<SecurityDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    get<SecurityDashboardData>('/api/v1/admin/security/dashboard')
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || '获取统计数据失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // ── Loading ──
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 animate-pulse">
            <div className="h-4 w-24 bg-slate-200 rounded mb-3" />
            <div className="h-8 w-16 bg-slate-200 rounded mb-2" />
            <div className="h-8 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  // ── Empty ──
  if (!data) {
    return null
  }

  const { stats, trend } = data

  // 月事件数：从 trend 汇总
  const monthEventCount = trend.reduce((acc, d) => acc + d.total, 0)

  const cards: StatCard[] = [
    {
      label: '今日事件',
      value: stats.todayEventCount,
      icon: <ShieldAlert size={20} />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: '本周事件',
      value: stats.weekEventCount,
      icon: <AlertTriangle size={20} />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: '本月事件',
      value: monthEventCount,
      icon: <Eye size={20} />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex items-start justify-between"
          >
            <div>
              <div className="text-xs text-slate-500 mb-1">{card.label}</div>
              <div className="text-2xl font-bold text-slate-900">{card.value.toLocaleString()}</div>
            </div>
            <div className={`p-2.5 rounded-lg ${card.bgColor} ${card.color}`}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* MiniChart — 趋势图 */}
      {trend.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <div className="text-xs text-slate-500 mb-2">近期趋势（每日事件数）</div>
          <MiniChart
            data={trend.map((d) => ({ value: d.total, label: d.date }))}
            width={600}
            height={48}
            color="#3b82f6"
            type="line"
          />
        </div>
      )}
    </div>
  )
}
