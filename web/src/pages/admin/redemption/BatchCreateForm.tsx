import { useState, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { post } from '@/lib/api'

// ── Props ──

interface BatchCreateFormProps {
  onClose: () => void
  onSuccess: () => void
}

// ── Default form state ──

const defaultForm = {
  name: '',
  amount: '',
  count: '100',
  expiresAt: '',
  maxUses: '1',
  note: '',
}

// ── Component ──

export default function BatchCreateForm({ onClose, onSuccess }: BatchCreateFormProps) {
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = useCallback(async () => {
    setError('')
    setSuccess('')
    if (!form.name || !form.amount || !form.count) {
      setError('请填写批次名称、面额和数量')
      return
    }
    setSubmitting(true)
    try {
      await post('/api/v1/redemption/codes/batch', {
        name: form.name,
        amount: form.amount,
        count: parseInt(form.count, 10),
        expiresAt: form.expiresAt || undefined,
        maxUses: parseInt(form.maxUses, 10) || 1,
        note: form.note || undefined,
      })
      setSuccess(`批次 "${form.name}" 创建成功`)
      setForm(defaultForm)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || '创建批次失败')
    } finally {
      setSubmitting(false)
    }
  }, [form, onClose, onSuccess])

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-purple-200 space-y-4">
      <h3 className="font-semibold text-slate-900">创建兑换码批次</h3>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />{success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">批次名称 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="例如：7月促销"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">面额 (￥) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="例如：10"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">数量 *</label>
          <input
            type="number"
            min="1"
            max="100000"
            value={form.count}
            onChange={(e) => setForm(f => ({ ...f, count: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">过期时间</label>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">最大使用次数</label>
          <input
            type="number"
            min="1"
            value={form.maxUses}
            onChange={(e) => setForm(f => ({ ...f, maxUses: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="可选"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2"
        >
          {submitting && <Loader2 className="animate-spin" size={16} />}
          确认创建
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm"
        >
          取消
        </button>
      </div>
    </div>
  )
}
