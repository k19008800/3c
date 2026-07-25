import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { post, patch } from '@/lib/api'

interface KeyGroup {
  id: number
  vendorId: number
  name: string
  strategy: string
  description: string | null
  status: boolean
}

const STRATEGY_OPTIONS = [
  { value: 'round_robin', label: '轮询', desc: '依次选择可用 Key，实现负载均衡' },
  { value: 'weighted', label: '加权轮询', desc: '根据权重分配请求，权重越高调用越多' },
  { value: 'failover', label: '故障转移', desc: '优先使用主 Key，故障时自动切换到备用 Key' },
  { value: 'priority', label: '优先级', desc: '按优先级顺序选择 Key，同一优先级内轮询' },
]

interface GroupDialogProps {
  mode: 'create' | 'edit'
  vendorId: number
  vendorName?: string
  group?: KeyGroup | null
  onClose: () => void
  onSuccess: () => void
}

export default function GroupDialog({ mode, vendorId, vendorName, group, onClose, onSuccess }: GroupDialogProps) {
  const [name, setName] = useState(group?.name || '')
  const [strategy, setStrategy] = useState(group?.strategy || 'round_robin')
  const [description, setDescription] = useState(group?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEdit = mode === 'edit'

  const handleSubmit = async () => {
    if (!name.trim()) { setError('请输入分组名称'); return }
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await patch(`/api/v1/admin/vendor-key-groups/${group!.id}`, { name, strategy, description })
      } else {
        await post('/api/v1/admin/vendor-key-groups', { vendorId, name, strategy, description })
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            {isEdit ? '编辑分组' : '创建分组'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Vendor (readonly) */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">供应商</label>
            <div className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700">
              {vendorName || `供应商 #${vendorId}`}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">分组名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主Key组、备用组"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">负载均衡策略</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              {STRATEGY_OPTIONS.find((o) => o.value === strategy)?.desc}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="分组的用途说明"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
