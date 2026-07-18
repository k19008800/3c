import { useState, useCallback } from 'react'
import {
  AlertCircle, CheckCircle2, Gift, Loader2, Send, X,
} from 'lucide-react'
import { post, patch } from '@/lib/api'
import { toDatetimeLocal } from './types'
import type { RedemptionBatch } from './types'

// ── Gift Modal ──

interface GiftModalProps {
  codeId: number
  codeDisplay: string
  onClose: () => void
  onSuccess: () => void
}

export function GiftModal({ codeId, codeDisplay, onClose, onSuccess }: GiftModalProps) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async () => {
    if (!email.trim()) {
      setError('请输入接收方邮箱')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await post(`/api/v1/redemption/codes/${codeId}/gift`, {
        toEmail: email.trim(),
        message: message.trim() || undefined,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || '转赠失败')
    } finally {
      setSubmitting(false)
    }
  }, [codeId, email, message, onClose, onSuccess])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Gift size={20} className="text-purple-600" />
            转赠兑换码
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-2">
          转赠兑换码：<span className="font-mono text-slate-700">{codeDisplay}</span>
        </p>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle size={16} />{error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">接收方邮箱 *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入接收方邮箱"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">留言（可选）</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="给对方留言..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !email.trim()}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              确认转赠
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Batch Edit Modal ──

interface BatchEditModalProps {
  batch: RedemptionBatch
  onClose: () => void
  onUpdated: () => void
}

export function BatchEditModal({ batch, onClose, onUpdated }: BatchEditModalProps) {
  const [form, setForm] = useState({
    name: batch.name,
    expiresAt: toDatetimeLocal(batch.expiresAt),
    note: batch.note || '',
    maxUses: String(batch.maxUses),
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleUpdate = useCallback(async () => {
    setError('')
    if (!form.name) {
      setError('批次名称不能为空')
      return
    }
    setSubmitting(true)
    try {
      await patch(`/api/v1/redemption/batches/${batch.id}`, {
        name: form.name,
        expiresAt: form.expiresAt || null,
        note: form.note || null,
        maxUses: parseInt(form.maxUses, 10) || 1,
      })
      onUpdated()
      onClose()
    } catch (err: any) {
      setError(err.message || '更新批次失败')
    } finally {
      setSubmitting(false)
    }
  }, [batch.id, form, onClose, onUpdated])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 shadow-xl border border-slate-200 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-900 text-lg mb-4">编辑批次</h3>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm mb-4">
            <AlertCircle size={16} />{error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
            <div>
              <label className="block text-xs text-slate-500 mb-1">面额（不可修改）</label>
              <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">
                ￥{Number(batch.amount).toFixed(2)}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">总数量（不可修改）</label>
              <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50">
                {batch.totalCount}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">批次名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
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

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleUpdate}
            disabled={submitting}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2"
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            保存修改
          </button>
          <button
            onClick={() => { onClose() }}
            className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
