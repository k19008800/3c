import { useMemo } from 'react'
import type { DashboardHealth } from '@/types'
import React from 'react';
import {AlertTriangle,
  CheckCircle2,
  Server,
  Database,
  HardDrive,
  Clock,
  Activity,
} from 'lucide-react'
import { fmtDuration, rateLimitPct, rateLimitColor } from './types'

/* ── Props ── */
interface Props {
  health: DashboardHealth
}

/* ════════════════════════════════════════
   HealthStatsCards
   System Status + Rate Limit + Recent Errors
   ════════════════════════════════════════ */
const HealthStatsCardsBase = React.memo(function HealthStatsCardsBase({ health }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <SystemStatusCard health={health} />
      <RateLimitCard health={health} />
      <RecentErrorsCard health={health} />
    </div>
  )
})

/* ── System Status ── */
function SystemStatusCard({ health }: Props) {
  const { system } = health

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Server size={16} className="text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-700">服务状态</h3>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Server size={13} /> API
          </span>
          <span className="flex items-center gap-1 text-xs">
            <CheckCircle2 size={13} className="text-green-500" />
            运行中
          </span>
        </div>
        <ServiceRow
          icon={<Database size={13} />}
          label="PostgreSQL"
          ok={system.db}
          okText="正常"
          failText="异常"
        />
        <ServiceRow
          icon={<HardDrive size={13} />}
          label="Redis"
          ok={system.redis}
          okText="正常"
          failText="异常"
        />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock size={13} /> 运行时长
          </span>
          <span className="text-xs text-slate-700 font-mono">
            {fmtDuration(system.uptime)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Small inline row showing a service status icon + label */
function ServiceRow({
  icon,
  label,
  ok,
  okText,
  failText,
}: {
  icon: React.ReactNode
  label: string
  ok: boolean
  okText: string
  failText: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon} {label}
      </span>
      <span
        className={`flex items-center gap-1 text-xs ${ok ? 'text-green-600' : 'text-red-600'}`}
      >
        {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
        {ok ? okText : failText}
      </span>
    </div>
  )
}

/* ── Rate Limit ── */
function RateLimitCard({ health }: Props) {
  const { globalRpm, globalTpm } = health.rateLimit
  const rpmPct = useMemo(() => rateLimitPct(globalRpm.current, globalRpm.limit), [globalRpm])
  const tpmPct = useMemo(() => rateLimitPct(globalTpm.current, globalTpm.limit), [globalTpm])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-700">限流水位</h3>
      </div>
      <div className="space-y-3">
        <RateLevelBar label="全局 RPM" current={globalRpm.current} limit={globalRpm.limit} pct={rpmPct} />
        <RateLevelBar
          label="全局 TPM"
          current={globalTpm.current}
          limit={globalTpm.limit}
          pct={tpmPct}
          formatNum
        />
      </div>
    </div>
  )
}

function RateLevelBar({
  label,
  current,
  limit,
  pct,
  formatNum,
}: {
  label: string
  current: number
  limit: number
  pct: number
  formatNum?: boolean
}) {
  const display = formatNum
    ? `${current.toLocaleString()} / ${limit.toLocaleString()}`
    : `${current} / ${limit}`

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs text-slate-700 font-mono">{display}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${rateLimitColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ── Recent Errors Summary ── */
function RecentErrorsCard({ health }: Props) {
  const { recentFailures } = health
  const errorRate = recentFailures.errorRate
  const isHigh = errorRate > 5

  const barColor = useMemo(() => {
    if (errorRate > 5) return 'bg-red-500'
    if (errorRate > 2) return 'bg-yellow-500'
    return 'bg-green-500'
  }, [errorRate])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className={isHigh ? 'text-red-600' : 'text-slate-600'} />
        <h3 className="text-sm font-semibold text-slate-700">近 1h 错误</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-2">
        <StatBlock label="总调用" value={recentFailures.total} className="bg-slate-50 text-slate-800" />
        <StatBlock label="失败" value={recentFailures.failed} className="bg-red-50 text-red-600" />
        <StatBlock label="超时" value={recentFailures.timeout} className="bg-yellow-50 text-yellow-600" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">错误率</span>
        <span className={`text-xs font-semibold ${isHigh ? 'text-red-600' : 'text-slate-700'}`}>
          {errorRate}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(errorRate, 100)}%` }}
        />
      </div>
    </div>
  )
}

function StatBlock({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className: string
}) {
  return (
    <div className={`rounded-lg p-2 ${className}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] opacity-70">{label}</p>
    </div>
  )
}

export default HealthStatsCardsBase;
