import { useMemo } from 'react'
import { fmtCost, fmtTokens } from './types'

interface ModelStat {
  modelName: string; calls: number; totalTokens: number; revenue: string
}

interface Props {
  modelStats: ModelStat[]
}

export default function ModelPerformance({ modelStats }: Props) {
  const rows = useMemo(() => modelStats, [modelStats])

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
