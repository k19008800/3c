// 转赠弹窗

import { useState } from 'react'
import { post } from '@/lib/api'
import { X, Send, Loader2 } from 'lucide-react'

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

  const handleSubmit = async () => {
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
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">转赠兑换码</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm text-slate-500 mb-1">兑换码</p>
            <code className="text-sm font-mono">{codeDisplay}</code>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              接收方邮箱 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="接收方邮箱地址"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              附言（可选）
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder="给接收方留句话..."
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Send size={16} />
                  确认转赠
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}