// ============================================================
//  EndpointSelector — 模型 / API 端点选择
// ============================================================

import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import type { ModelItem } from './types'

interface EndpointSelectorProps {
  models: ModelItem[]
  selectedModel: string
  loading: boolean
  onChange: (model: string) => void
}

export default memo(function EndpointSelector({
  models,
  selectedModel,
  loading,
  onChange,
}: EndpointSelectorProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <label className="text-xs font-medium text-slate-500 mb-2 block">选择模型</label>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          加载模型列表...
        </div>
      ) : models.length === 0 ? (
        <p className="text-sm text-slate-400">暂无可用模型</p>
      ) : (
        <select
          value={selectedModel}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
        >
          {models.map((m) => (
            <option key={m.id} value={m.name}>{m.displayName || m.name}</option>
          ))}
        </select>
      )}
    </div>
  )
})
