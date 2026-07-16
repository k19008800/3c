/**
 * SummaryBar — 管理控制台顶部状态栏
 *
 * 实时展示：在线通道、今日调用、今日 Token、今日消耗、异常告警
 */

import { Activity, Cpu, DollarSign, AlertTriangle, Link2 } from 'lucide-react'

interface SummaryData {
  activeChannels: number
  todayCalls: number
  todayTokens: number
  todayCost: string
  anomalyCount: number
}

interface SummaryBarProps {
  data: SummaryData | null
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  highlight,
}: {
  icon: any
  label: string
  value: string
  sub?: string
  color: string
  highlight?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border ${highlight ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 truncate">{label}</p>
          <p className={`text-xl font-bold mt-0.5 ${highlight ? 'text-red-600' : 'text-slate-900'}`}>
            {value && value !== 'undefined' && value !== 'null' ? value : '—'}
          </p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color} shrink-0 ml-2`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  )
}

export default function SummaryBar({ data }: SummaryBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard
        icon={Link2}
        label="在线通道"
        value={data ? String(data.activeChannels) : '—'}
        color="bg-blue-500"
      />
      <StatCard
        icon={Activity}
        label="今日调用"
        value={data ? (data.todayCalls >= 10000
          ? `${(data.todayCalls / 10000).toFixed(1)}万`
          : String(data.todayCalls)) : '—'}
        sub={data ? `¥${data.todayCost}` : undefined}
        color="bg-emerald-500"
      />
      <StatCard
        icon={Cpu}
        label="今日 Token"
        value={data ? (data.todayTokens >= 1000000
          ? `${(data.todayTokens / 1000000).toFixed(1)}M`
          : data.todayTokens >= 10000
            ? `${(data.todayTokens / 10000).toFixed(1)}万`
            : String(data.todayTokens)) : '—'}
        color="bg-violet-500"
      />
      <StatCard
        icon={DollarSign}
        label="今日消耗"
        value={data ? `¥${data.todayCost}` : '—'}
        color="bg-amber-500"
      />
      <StatCard
        icon={AlertTriangle}
        label="异常告警"
        value={data ? String(data.anomalyCount) : '—'}
        color={data && data.anomalyCount > 0 ? 'bg-red-500' : 'bg-slate-400'}
        highlight={data ? data.anomalyCount > 0 : false}
      />
    </div>
  )
}
