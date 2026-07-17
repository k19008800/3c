// ──────────────────────────────────────────────
//  UserStatsCard — 用户统计卡片（页头）
//  展示总用户数、活跃用户、本月新增、今日新增
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { Users, Activity, UserPlus, TrendingUp } from 'lucide-react'

interface UserStatsData {
  totalUsers: number
  activeUsers: number
  newThisMonth: number
  newToday: number
}

function LoadingCard({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-100">
          <Icon size={18} className="text-slate-400" />
        </div>
        <div className="space-y-1.5 flex-1">
          <p className="text-xs text-slate-500">{label}</p>
          <div className="h-5 w-16 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
}: {
  icon: any
  label: string
  value: string | number
  sub?: string
  iconBg: string
  iconColor: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition hover:shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

export default function UserStatsCard() {
  const [stats, setStats] = useState<UserStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      const data = await get<UserStatsData>('/api/v1/admin/users/stats')
      setStats(data)
    } catch {
      // silently fail — stats are non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <LoadingCard icon={Users} label="总用户数" />
        <LoadingCard icon={Activity} label="活跃用户" />
        <LoadingCard icon={UserPlus} label="本月新增" />
        <LoadingCard icon={TrendingUp} label="今日新增" />
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={Users}
        label="总用户数"
        value={stats.totalUsers}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
      />
      <StatCard
        icon={Activity}
        label="活跃用户"
        value={stats.activeUsers}
        iconBg="bg-green-50"
        iconColor="text-green-600"
      />
      <StatCard
        icon={UserPlus}
        label="本月新增"
        value={stats.newThisMonth}
        sub="自然月累计"
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
      />
      <StatCard
        icon={TrendingUp}
        label="今日新增"
        value={stats.newToday}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
      />
    </div>
  )
}
