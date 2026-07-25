import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { Loader2, AlertCircle, Activity, TrendingUp, ShieldAlert, ShieldCheck } from 'lucide-react'

interface RiskStats {
  totalEvents: number
  criticalCount: number
  highCount: number
  unacknowledgedCount: number
}

export default function RiskStatsCards() {
  const [stats, setStats] = useState<RiskStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await get<RiskStats>('/api/v1/admin/risk-control/stats')
      setStats(res)
    } catch (err: any) {
      setError(err.message || '获取风控统计失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
        <AlertCircle size={16} /> {error}
      </div>
    )
  }

  if (!stats) return null

  const cards = [
    {
      label: '近 30 天风险事件',
      value: stats.totalEvents,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '严重事件',
      value: stats.criticalCount,
      icon: ShieldAlert,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: '高危事件',
      value: stats.highCount,
      icon: TrendingUp,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: '未确认的高危/严重',
      value: stats.unacknowledgedCount,
      icon: ShieldCheck,
      color: 'text-purple-600' as string,
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label} className={`${card.bg} rounded-xl p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{card.label}</p>
              <p className={`text-3xl font-bold mt-1 ${card.color}`}>
                {card.value}
              </p>
            </div>
            <card.icon className={card.color} size={32} />
          </div>
        </div>
      ))}
    </div>
  )
}
