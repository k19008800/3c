import { BarChart3 } from 'lucide-react'
import type { ModelBreakdown } from './types'
import { fmt } from './types'

interface Props {
  modelBreakdown: ModelBreakdown[]
  loadingModels: boolean
}

export default function ModelUsage({ modelBreakdown, loadingModels }: Props) {
  if (loadingModels) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 size={14} /> 模型使用概览
        </h3>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{modelBreakdown.length}</div>
            <div className="text-xs text-slate-400 mt-1">使用模型数</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{modelBreakdown.reduce((s, m) => s + m.totalCalls, 0).toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-1">总调用量</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-emerald-600">{(modelBreakdown.reduce((s, m) => s + m.totalTokens, 0) / 10000).toFixed(1)}万</div>
            <div className="text-xs text-slate-400 mt-1">总 Token</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-emerald-600">¥{fmt(modelBreakdown.reduce((s, m) => s + parseFloat(m.totalCost), 0))}</div>
            <div className="text-xs text-slate-400 mt-1">总消费</div>
          </div>
        </div>
      </div>
    </div>
  )
}
