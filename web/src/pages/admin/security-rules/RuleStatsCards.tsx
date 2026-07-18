import { useMemo } from 'react'
import { Shield, ShieldCheck, ShieldOff, Activity } from 'lucide-react'
import type { AutoRule, RuleStats } from './types'

interface Props {
  rules: AutoRule[]
}

function MiniChart({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export default function RuleStatsCards({ rules }: Props) {
  const stats: RuleStats = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter((r) => r.enabled).length,
    disabled: rules.filter((r) => !r.enabled).length,
    banActions: rules.filter((r) => r.action === 'ban_ip' || r.action === 'ban_user').length,
    notifyActions: rules.filter((r) => r.action === 'notify_admin').length,
  }), [rules])

  if (rules.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <StatCard
        icon={<Shield size={16} />}
        label="总规则"
        value={stats.total}
        bg="bg-indigo-100"
        color="text-indigo-600"
      />
      <StatCard
        icon={<ShieldCheck size={16} />}
        label="启用"
        value={stats.enabled}
        bg="bg-green-100"
        color="text-green-600"
        chart={<MiniChart value={stats.enabled} max={stats.total} color="#22c55e" />}
      />
      <StatCard
        icon={<ShieldOff size={16} />}
        label="停用"
        value={stats.disabled}
        bg="bg-slate-100"
        color="text-slate-500"
        chart={<MiniChart value={stats.disabled} max={stats.total} color="#94a3b8" />}
      />
      <StatCard
        icon={<Activity size={16} />}
        label="封禁动作"
        value={stats.banActions}
        bg="bg-red-100"
        color="text-red-600"
        chart={<MiniChart value={stats.banActions} max={stats.total} color="#ef4444" />}
      />
      <StatCard
        icon={<Shield size={16} />}
        label="通知动作"
        value={stats.notifyActions}
        bg="bg-amber-100"
        color="text-amber-600"
        chart={<MiniChart value={stats.notifyActions} max={stats.total} color="#f59e0b" />}
      />
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  bg,
  color,
  chart,
}: {
  icon: React.ReactNode
  label: string
  value: number
  bg: string
  color: string
  chart?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
      <div className={`rounded-full ${bg} p-2 shrink-0`}>
        <span className={color}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
      {chart}
    </div>
  )
}
