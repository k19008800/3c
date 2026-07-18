import { useEffect, useState } from 'react'
import { post, put } from '@/lib/api'
import { Loader2, AlertCircle, Save, X } from 'lucide-react'
import type { VendorModelInfo } from './types'

interface Props {
  open: boolean
  edit: VendorModelInfo | null
  onClose: () => void
  onSaved: () => void
}

export default function ModelFormModal({ open, edit, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    modelId: '', upstreamModelName: '', sellPriceInput: '', sellPriceOutput: '',
    weight: '100', status: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (edit) {
      setForm({
        modelId: String(edit.modelId),
        upstreamModelName: edit.upstreamModelName,
        sellPriceInput: edit.sellPriceInput,
        sellPriceOutput: edit.sellPriceOutput,
        weight: String(edit.weight),
        status: edit.status,
      })
    } else {
      setForm({ modelId: '', upstreamModelName: '', sellPriceInput: '', sellPriceOutput: '', weight: '100', status: true })
    }
    setError('')
  }, [edit, open])

  if (!open) return null

  const handleSave = async () => {
    if (!form.upstreamModelName.trim()) { setError('请输入上游模型名称'); return }
    setSaving(true); setError('')
    try {
      if (edit) {
        await put(`/api/vendor/models/${edit.id}`, {
          upstreamModelName: form.upstreamModelName,
          sellPriceInput: parseFloat(form.sellPriceInput) || 0,
          sellPriceOutput: parseFloat(form.sellPriceOutput) || 0,
          weight: parseInt(form.weight) || 100,
          status: form.status,
        })
      } else {
        await post('/api/vendor/models', {
          modelId: parseInt(form.modelId) || 0,
          upstreamModelName: form.upstreamModelName,
          sellPriceInput: parseFloat(form.sellPriceInput) || 0,
          sellPriceOutput: parseFloat(form.sellPriceOutput) || 0,
          weight: parseInt(form.weight) || 100,
          status: form.status,
        })
      }
      onSaved(); onClose()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '保存失败')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{edit ? '编辑模型配置' : '添加模型映射'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm mb-3">
            <AlertCircle size={16} />{error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上游模型名称</label>
            <input type="text" value={form.upstreamModelName}
              onChange={e => setForm(p => ({ ...p, upstreamModelName: e.target.value }))}
              placeholder="如: gpt-4o"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">售价Input (¥/token)</label>
              <input type="number" step="0.000001" value={form.sellPriceInput}
                onChange={e => setForm(p => ({ ...p, sellPriceInput: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">售价Output (¥/token)</label>
              <input type="number" step="0.000001" value={form.sellPriceOutput}
                onChange={e => setForm(p => ({ ...p, sellPriceOutput: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">权重 (0-100)</label>
              <input type="number" min="0" max="100" value={form.weight}
                onChange={e => setForm(p => ({ ...p, weight: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
              <select value={form.status ? 'true' : 'false'}
                onChange={e => setForm(p => ({ ...p, status: e.target.value === 'true' }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {edit ? '保存' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
