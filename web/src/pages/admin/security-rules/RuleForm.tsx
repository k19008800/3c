import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { RuleFormData } from './types'
import { EVENT_TYPES, ACTIONS, emptyForm } from './types'

interface Props {
  open: boolean
  editId: number | null
  saving: boolean
  initialData?: RuleFormData
  onSubmit: (data: RuleFormData) => void
  onClose: () => void
}

export default function RuleForm({ open, editId, saving, initialData, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<RuleFormData>(emptyForm)

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setForm(initialData ?? emptyForm)
    }
  }, [open, initialData])

  const updateField = useCallback(<K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])

  const handleSubmit = useCallback(() => {
    onSubmit(form)
  }, [form, onSubmit])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => !saving && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {editId ? '编辑规则' : '新增规则'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">规则名称 *</label>
            <input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">事件类型</label>
              <select
                value={form.eventType}
                onChange={(e) => updateField('eventType', e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-50"
              >
                {EVENT_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">执行动作</label>
              <select
                value={form.action}
                onChange={(e) => updateField('action', e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-50"
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">触发次数</label>
              <input
                type="number"
                value={form.countThreshold}
                onChange={(e) => updateField('countThreshold', parseInt(e.target.value) || 1)}
                disabled={saving}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">时间窗口(秒)</label>
              <input
                type="number"
                value={form.timeWindowSeconds}
                onChange={(e) => updateField('timeWindowSeconds', parseInt(e.target.value) || 60)}
                disabled={saving}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50"
                min={1}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">动作参数 (JSON)</label>
            <textarea
              value={form.actionParams}
              onChange={(e) => updateField('actionParams', e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono disabled:opacity-50"
              rows={2}
              placeholder='{"banDurationSeconds": 3600}'
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="animate-spin" size={14} />}
            {editId ? '保存修改' : '创建规则'}
          </button>
        </div>
      </div>
    </div>
  )
}
