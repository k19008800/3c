// ============================================================
//  CampaignForm.tsx — 活动创建/编辑表单（Modal 弹窗）
// ============================================================

import { useState } from 'react'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { post, patch } from '@/lib/api'
import type { Campaign } from './types'
import { emptyForm } from './types'

interface CampaignFormProps {
  campaign: Campaign | null
  onClose: () => void
  onSuccess: () => void
}

export default function CampaignForm({ campaign, onClose, onSuccess }: CampaignFormProps) {
  const isEdit = !!campaign
  const [form, setForm] = useState(
    isEdit
      ? {
          name: campaign!.name,
          description: campaign!.description || '',
          start_at: campaign!.start_at ? campaign!.start_at.slice(0, 16) : '',
          end_at: campaign!.end_at ? campaign!.end_at.slice(0, 16) : '',
          budget_amount: campaign!.budget_amount,
        }
      : { ...emptyForm },
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const updateField = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async () => {
    setMessage('')
    setError('')
    if (!form.name.trim()) {
      setError('请输入活动名称')
      return
    }
    if (!form.budget_amount || Number(form.budget_amount) <= 0) {
      setError('请输入有效预算')
      return
    }

    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        budget_amount: form.budget_amount,
      }

      if (isEdit) {
        await patch(`/api/v1/admin/campaigns/${campaign!.id}`, body)
        setMessage('活动已更新')
      } else {
        await post('/api/v1/admin/campaigns', body)
        setMessage('活动已创建')
      }
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isEdit ? '编辑活动' : '新建活动'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              &times;
            </button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                活动名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="例如：暑期大促"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">描述</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="活动描述（选填）"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始时间</label>
                <input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => updateField('start_at', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束时间</label>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => updateField('end_at', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                预算金额 (￥) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.budget_amount}
                onChange={(e) => updateField('budget_amount', e.target.value)}
                min={0}
                step="0.01"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving
                ? isEdit
                  ? '更新中...'
                  : '创建中...'
                : isEdit
                  ? '保存'
                  : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
