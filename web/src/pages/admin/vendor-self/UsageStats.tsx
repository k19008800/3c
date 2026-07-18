/**
 * UsageStats — 调用用量统计（柱状表格 + 模型分布）
 */

import { useMemo } from 'react'
import { Loader2, Activity, Zap, DollarSign, BarChart3 } from 'lucide-react'
import type { VendorStats } from './types'
import { fmtTokens, fmtCost } from './types'

// ── StatCard (local: stat cards for the usage tab) ──

function StatCard({ label, value, color, icon: Icon }: {
  label: string; value: string; color: string; icon: any
}) {
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon size={14} className="text-slate-400" />
      </div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
    </div>
  )
}

// ── ModelBreakdownTable ──

function ModelBreakdownTable({ modelStats }: {
  modelStats: VendorStats['modelStats']
}) {
  const rows = useMemo(() => modelStats || [], [modelStats])

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h4 className="font-semibold text-sm text-slate-700">按模型统计</h4>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-4 py-2 font-medium text-slate-500">模型</th>
            <th className="px-4 py-2 font-medium text-slate-500 text-right">调用</th>
            <th className="px-4 py-2 font-medium text-slate-500 text-right">Token</th>
            <th className="px-4 py-2 font-medium text-slate-500 text-right">营收</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((m, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-medium text-slate-700">{m.modelName}</td>
              <td className="px-4 py-2 text-right text-slate-600">{m.calls.toLocaleString()}</td>
              <td className="px-4 py-2 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
              <td className="px-4 py-2 text-right text-slate-900 font-mono font-medium">{fmtCost(m.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 主导出 ──

export default function UsageStats({ stats, loading }: {
  stats: VendorStats | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        暂无统计数据
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="总调用次数"
          value={stats.totalCalls.toLocaleString()}
          icon={Activity}
          color="border-blue-200 bg-blue-50"
        />
        <StatCard
          label="今日调用"
          value={stats.todayCalls.toLocaleString()}
          icon={Zap}
          color="border-purple-200 bg-purple-50"
        />
        <StatCard
          label="总营收"
          value={fmtCost(stats.totalRevenue)}
          icon={DollarSign}
          color="border-green-200 bg-green-50"
        />
        <StatCard
          label="总 Token"
          value={fmtTokens(stats.totalTokens || 0)}
          icon={BarChart3}
          color="border-amber-200 bg-amber-50"
        />
      </div>
      <ModelBreakdownTable modelStats={stats.modelStats} />
    </div>
  )
}
