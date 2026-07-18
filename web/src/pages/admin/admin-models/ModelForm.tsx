import { useState } from 'react'
import { post, patch } from '@/lib/api'
import type { AdminModel } from '@/types'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { TYPE_OPTIONS, TYPE_MAP } from './types'

interface Props {
  model: AdminModel | null
  onClose: () => void
  onSaved: () => void
  saving: boolean
  setSaving: (v: boolean) => void
}

export default function ModelForm({ model, onClose, onSaved, saving, setSaving }: Props) {
  const isEdit = !!model
  const [name, setName] = useState(model?.name || '')
  const [displayName, setDisplayName] = useState(model?.displayName || '')
  const [description, setDescription] = useState(model?.description || '')
  const [type, setType] = useState(model?.type || 'chat')
  const [status, setStatus] = useState(model?.status ?? true)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  const handleSubmit = async () => {
    setMessage('')
    setFormError('')

    if (!name.trim()) {
      setFormError('模型名称不能为空')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        const body: Record<string, unknown> = {}
        if (name !== model.name) body.name = name
        if (displayName !== (model.displayName || '')) body.displayName = displayName || undefined
        if (description !== (model.description || '')) body.description = description || undefined
        if (type !== model.type) body.type = type
        if (status !== model.status) body.status = status
        await patch(`/api/v1/admin/models/${model.id}`, body)
        setMessage('模型已更新')
      } else {
        await post('/api/v1/admin/models', {
          name: name.trim(),
          displayName: displayName.trim() || undefined,
          description: description.trim() || undefined,
          type,
        })
        setMessage('模型已创建')
      }
      setTimeout(onSaved, 800)
    } catch (err: any) {
      setFormError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEdit ? '编辑模型' : '新增模型'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">
              &times;
            </button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}

          {formError && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                模型名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：gpt-4o"
                disabled={isEdit}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              />
              {isEdit && <p className="text-xs text-slate-400 mt-1">创建后不可修改</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">显示名称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：GPT-4o"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">简介</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="模型的用途和特性简介"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                类型 <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isEdit}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              >
                {TYPE_OPTIONS.filter((t) => t.value).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {isEdit && <p className="text-xs text-slate-400 mt-1">创建后不可修改</p>}
            </div>

            {isEdit && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">状态</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStatus(true)}
                    className={`px-4 py-2 text-sm rounded-lg border transition ${
                      status
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    启用
                  </button>
                  <button
                    onClick={() => setStatus(false)}
                    className={`px-4 py-2 text-sm rounded-lg border transition ${
                      !status
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    停用
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? (isEdit ? '更新中...' : '创建中...') : isEdit ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
