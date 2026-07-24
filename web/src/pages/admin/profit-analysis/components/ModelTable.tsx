import { AlertTriangle } from 'lucide-react'
import type { ModelProfitRow } from '../types'
import { fmt, fmtPct, fmtNum } from '../types'

interface ModelTableProps {
  models: ModelProfitRow[]
  lowMarginThreshold?: number
}

export default function ModelTable({ models, lowMarginThreshold = 0.1 }: ModelTableProps) {
  if (models.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
        暂无模型数据
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">模型利润明细</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">模型</th>
              <th className="px-4 py-3 text-right">调用次数</th>
              <th className="px-4 py-3 text-right">收入</th>
              <th className="px-4 py-3 text-right">成本</th>
              <th className="px-4 py-3 text-right">利润</th>
              <th className="px-4 py-3 text-right">利润率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {models.map((m, i) => {
              const isLowMargin = m.marginRate < lowMarginThreshold

              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.modelName}
                      {isLowMargin && (
                        <AlertTriangle size={14} className="text-amber-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {fmtNum(m.totalCalls)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">{fmt(m.revenue)}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{fmt(m.cost)}</td>
                  <td className={`px-4 py-3 text-right ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(m.profit)}
                  </td>
                  <td className={`px-4 py-3 text-right ${m.marginRate >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                    {fmtPct(m.marginRate)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}