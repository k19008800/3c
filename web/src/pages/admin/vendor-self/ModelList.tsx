/**
 * ModelList — 模型列表 + 添加/编辑 Modal
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Edit3, Trash2, X, Save, AlertCircle } from 'lucide-react'
import api from '@/lib/api'
import type { VendorModelInfo } from './types'
import { parseCost } from './types'

// ── ModelFormModal ──

function ModelFormModal({ open, edit, onClose, onSaved, vendorKey }: {
  open: boolean; edit: VendorModelInfo | null
  onClose: () => void; onSaved: () => void; vendorKey: string
}) {
  const [form, setForm] = useState({
    modelId: '',
    upstreamModelName: '',
    sellPriceInput: '',
    sellPriceOutput: '',
    weight: '100',
    status: true,
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
      setForm({
        modelId: '',
        upstreamModelName: '',
        sellPriceInput: '',
        sellPriceOutput: '',
        weight: '100',
        status: true,
      })
    }
    setError('')
  }, [edit, open])

  const handleSave = useCallback(async () => {
    if (!form.upstreamModelName.trim()) {
      setError('请输入上游模型名称')
      return
    }
    setSaving(true)
    setError('')
    const headers = { 'X-Vendor-Key': vendorKey }
    const payload = {
      upstreamModelName: form.upstreamModelName,
      sellPriceInput: parseCost(form.sellPriceInput),
      sellPriceOutput: parseCost(form.sellPriceOutput),
      weight: parseInt(form.weight) || 100,
      status: form.status,
    }

    try {
      if (edit) {
        await api.put(`/api/vendor/models/${edit.id}`, payload, { headers })
      } else {
        await api.post('/api/vendor/models', {
          ...payload,
          modelId: parseInt(form.modelId) || 0,
        }, { headers })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [form, edit, vendorKey, onSaved, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{edit ? '编辑模型配置' : '添加模型映射'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm mb-3">
            <AlertCircle size={16} />{error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上游模型名称</label>
            <input
              type="text" value={form.upstreamModelName}
              onChange={e => setForm(p => ({ ...p, upstreamModelName: e.target.value }))}
              placeholder="如: gpt-4o"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">售价Input (¥/token)</label>
              <input
                type="number" step="0.000001" value={form.sellPriceInput}
                onChange={e => setForm(p => ({ ...p, sellPriceInput: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">售价Output (¥/token)</label>
              <input
                type="number" step="0.000001" value={form.sellPriceOutput}
                onChange={e => setForm(p => ({ ...p, sellPriceOutput: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">权重 (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.weight}
                onChange={e => setForm(p => ({ ...p, weight: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
              <select
                value={form.status ? 'true' : 'false'}
                onChange={e => setForm(p => ({ ...p, status: e.target.value === 'true' }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
            >取消</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {edit ? '保存' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ModelList 主导出 ──

export default function ModelList({ models, loading, vendorKey, onRefresh }: {
  models: VendorModelInfo[]
  loading: boolean
  vendorKey: string
  onRefresh: () => void
}) {
  const [showModelModal, setShowModelModal] = useState(false)
  const [editingModel, setEditingModel] = useState<VendorModelInfo | null>(null)
  const [error, setError] = useState('')

  const handleDelete = useCallback(async (id: number, name: string) => {
    if (!confirm(`确认删除模型映射 "${name}" ？`)) return
    try {
      const res = await api.delete(`/api/vendor/models/${id}`, {
        headers: { 'X-Vendor-Key': vendorKey },
      })
      if (res.data.code !== 0) throw new Error(res.data.message || '删除失败')
      onRefresh()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || '删除失败')
    }
  }, [vendorKey, onRefresh])

  const openAdd = useCallback(() => {
    setEditingModel(null)
    setShowModelModal(true)
  }, [])

  const openEdit = useCallback((m: VendorModelInfo) => {
    setEditingModel(m)
    setShowModelModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowModelModal(false)
    setEditingModel(null)
  }, [])

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-sm">
          <AlertCircle size={16} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">共 {models.length} 个模型映射</span>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
        >
          <Plus size={14} />添加模型
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          暂无模型映射，点击"添加模型"开始
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-slate-500">上游模型名</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500">平台模型名</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">售价Input</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">售价Output</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500 text-right">权重</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500">状态</th>
                  <th className="px-4 py-2.5 font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {models.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-700">{m.upstreamModelName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.modelName}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                      ¥{Number(m.sellPriceInput).toFixed(6)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                      ¥{Number(m.sellPriceOutput).toFixed(6)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{m.weight}</td>
                    <td className="px-4 py-2.5">
                      {m.status ? (
                        <span className="text-green-600">启用</span>
                      ) : (
                        <span className="text-red-600">禁用</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(m)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id, m.upstreamModelName)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModelFormModal
        open={showModelModal}
        edit={editingModel}
        onClose={closeModal}
        onSaved={onRefresh}
        vendorKey={vendorKey}
      />
    </div>
  )
}
