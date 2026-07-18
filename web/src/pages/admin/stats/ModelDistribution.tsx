import { useMemo } from 'react'
import { Loader2, Cpu } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ModelStatItem } from './types'
import { fmtTokens, fmtCost } from './types'
import { TokenTooltip } from './Tooltips'

interface ModelDistributionProps {
  data: ModelStatItem[]
  loading: boolean
}

/** Top 10 models bar chart */
function TopModelsChart({ data }: { data: ModelStatItem[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 10), [data])

  return (
    <div className="p-4">
      <h4 className="text-xs font-medium text-slate-500 mb-3">
        <Cpu size={12} className="inline mr-1 text-purple-500" />模型 Token 排行 (Top 10)
      </h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
            <YAxis type="category" dataKey="displayName" tick={{ fontSize: 10 }} width={90} />
            <Tooltip content={<TokenTooltip />} />
            <Bar dataKey="totalTokens" fill="#8B5CF6" name="Token" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Full model detail table */
function ModelTable({ data }: { data: ModelStatItem[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.totalTokens - a.totalTokens), [data])

  return (
    <div className="px-4 pb-4">
      <h4 className="text-xs font-medium text-slate-500 mb-2">全部模型明细</h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-3 py-2 font-medium text-slate-500">模型</th>
            <th className="px-3 py-2 font-medium text-slate-500 text-right">调用</th>
            <th className="px-3 py-2 font-medium text-slate-500 text-right">Token</th>
            <th className="px-3 py-2 font-medium text-slate-500 text-right">花费</th>
            <th className="px-3 py-2 font-medium text-slate-500 text-right">成功率</th>
            <th className="px-3 py-2 font-medium text-slate-500 text-right">平均延迟</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((m, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-700">{m.displayName || m.modelName || '未知'}</td>
              <td className="px-3 py-2 text-right text-slate-600">{m.totalCalls.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-slate-600 font-mono">{fmtTokens(m.totalTokens)}</td>
              <td className="px-3 py-2 text-right text-slate-900 font-mono font-medium">{fmtCost(m.totalCost)}</td>
              <td className="px-3 py-2 text-right">
                <span className={`font-mono ${m.successRate < 90 ? 'text-red-600' : 'text-slate-600'}`}>{m.successRate}%</span>
              </td>
              <td className="px-3 py-2 text-right text-slate-600">{m.avgDuration}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──── Main ────

export default function ModelDistribution({ data, loading }: ModelDistributionProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={24} /></div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="py-12 text-center text-sm text-slate-400">暂无数据</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <TopModelsChart data={data} />
      <ModelTable data={data} />
    </div>
  )
}
