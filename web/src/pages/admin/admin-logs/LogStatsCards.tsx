import React, { useEffect, useState } from 'react'
import { Activity, Cpu, DollarSign, Clock, CheckCircle2, XCircle } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { get } from '@/lib/api'
import type { LogSummary, LogTrendPoint } from '@/types'

/* ── Props ── */

interface LogStatsCardsProps {
  summary: LogSummary | null
  loading: boolean
}

/* ── StatCard ── */

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: typeof Activity
  label: string
  value: string
  sub?: string
  color: string
}) {
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

/* ── TrendMiniChart ── */

function TrendMiniChart() {
  const [trends, setTrends] = useState<LogTrendPoint[]>([])
  const [loadingTrend, setLoadingTrend] = useState(true)

  useEffect(() => {
    get<{ days: number; series: LogTrendPoint[] }>('/api/v1/admin/logs/trends', { days: 7 })
      .then((data) => setTrends(data.series || []))
      .catch(() => { /* silent fallback */ })
      .finally(() => setLoadingTrend(false))
  }, [])

  if (loadingTrend || trends.length === 0) return null

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <p className="text-xs text-slate-500 mb-2">
        <Activity size={12} className="inline mr-1 text-blue-500" />
        近 7 日操作频率趋势
      </p>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip
              contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}
              labelFormatter={(l: any) => `日期: ${String(l)}`}
            />
            <Area
              type="monotone"
              dataKey="calls"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.08}
              name="调用次数"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── Main ── */

const LogStatsCardsBase = React.memo(function LogStatsCardsBase({ summary, loading }: LogStatsCardsProps) {
  if (loading || !summary) return null

  return (
    <>
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
          value={`${Number(summary.totalTokens / 10_000).toFixed(2)}万`}
          sub={`${Number(summary.totalTokens).toLocaleString()} tokens`}
          color="bg-purple-500"
        />
        <StatCard
          icon={DollarSign}
          label="总消费"
          value={`¥${Number(summary.totalCost).toFixed(4)}`}
          color="bg-amber-500"
        />
        <StatCard
          icon={Clock}
          label="平均耗时"
          value={summary.avgDuration > 0 ? `${summary.avgDuration}ms` : '-'}
          color="bg-indigo-500"
        />
      </div>

      {/* MiniChart — 操作频率趋势 */}
      <TrendMiniChart />
    </>
  )
})

export default LogStatsCardsBase;