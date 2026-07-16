import { Activity, Cpu, DollarSign, Clock, CheckCircle2, XCircle } from 'lucide-react'
import type { LogSummary } from '@/types'

interface LogStatsCardsProps {
  summary: LogSummary | null
  loading: boolean
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className="text-lg font-bold text-slate-900 truncate">{value}</p>
          {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  )
}

export default function LogStatsCards({ summary, loading }: LogStatsCardsProps) {
  if (loading || !summary) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        icon={Activity}
        label="总调用"
        value={summary.totalCalls.toLocaleString()}
        color="bg-blue-500"
      />
      <StatCard
        icon={CheckCircle2}
        label="成功"
        value={summary.successCalls.toLocaleString()}
        sub={`成功率 ${summary.successRate}%`}
        color="bg-green-500"
      />
      <StatCard
        icon={XCircle}
        label="失败"
        value={summary.failedCalls.toLocaleString()}
        color="bg-red-500"
      />
      <StatCard
        icon={Cpu}
        label="总 Token"
        value={Number(summary.totalTokens / 10000).toFixed(2) + '万'}
        sub={Number(summary.totalTokens).toLocaleString() + ' tokens'}
        color="bg-purple-500"
      />
      <StatCard
        icon={DollarSign}
        label="总消费"
        value={'¥' + Number(summary.totalCost).toFixed(4)}
        color="bg-amber-500"
      />
      <StatCard
        icon={Clock}
        label="平均耗时"
        value={summary.avgDuration > 0 ? `${summary.avgDuration}ms` : '-'}
        color="bg-indigo-500"
      />
    </div>
  )
}
