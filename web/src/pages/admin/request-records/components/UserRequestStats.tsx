/**
 * UserRequestStats — 用户请求统计卡片
 *
 * 4 个统计指标卡片（总数/高风险/今日/模型数）
 */

import { Activity, AlertTriangle, Calendar, Cpu } from 'lucide-react'

interface UserRequestStatsProps {
  totalRequests: number
  highRiskRequests: number
  todayRequests: number
  activeModels: number
  loading?: boolean
}

interface StatCardProps {
  icon: typeof Activity
  label: string
  value: number | string
  color: string
  loading?: boolean
}

function StatCard({ icon: Icon, label, value, color, loading }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          {loading ? (
            <div className="h-7 w-20 bg-slate-200 animate-pulse rounded" />
          ) : (
            <p className="text-lg font-bold text-slate-900 truncate">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  )
}

export default function UserRequestStats({
  totalRequests,
  highRiskRequests,
  todayRequests,
  activeModels,
  loading = false,
}: UserRequestStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={Activity}
        label="总请求数"
        value={totalRequests}
        color="bg-blue-500"
        loading={loading}
      />
      <StatCard
        icon={AlertTriangle}
        label="高风险请求"
        value={highRiskRequests}
        color="bg-red-500"
        loading={loading}
      />
      <StatCard
        icon={Calendar}
        label="今日请求"
        value={todayRequests}
        color="bg-green-500"
        loading={loading}
      />
      <StatCard
        icon={Cpu}
        label="活跃模型数"
        value={activeModels}
        color="bg-purple-500"
        loading={loading}
      />
    </div>
  )
}