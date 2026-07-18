import { useState } from 'react'
import { Gift, X, AlertCircle, Loader2, Send } from 'lucide-react'
import { post } from '@/lib/api'

interface Props {
  codeId: number
  codeDisplay: string
  onClose: () => void
  onSuccess: () => void
}

export default function DistributionPanel({ codeId, codeDisplay, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (codeId === -1) return null

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
            <AlertCircle size={16} />
            {error}
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
