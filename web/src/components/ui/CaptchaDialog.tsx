import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface CaptchaDialogProps {
  email: string
  captchaSession: string
  onSubmit: (captchaCode: string, captchaSession: string) => Promise<void>
  onCancel: () => void
}

export default function CaptchaDialog({ email, captchaSession, onSubmit, onCancel }: CaptchaDialogProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!code.trim()) { setError('请输入验证码'); return }
    setLoading(true)
    try {
      await onSubmit(code.trim(), captchaSession)
    } catch (err: any) {
      setError(err.message || '验证码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔐</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">安全验证</h3>
          <p className="text-sm text-slate-500 mt-1">
            检测到异常登录行为，验证码已发送至 <strong className="text-slate-700">{email}</strong>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-2.5 text-sm text-red-600 bg-red-50 rounded-lg">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入邮箱验证码"
            maxLength={8}
            className="w-full px-3 py-2.5 text-center text-lg tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            autoFocus
          />
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
              取消
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {loading && <Loader2 className="animate-spin" size={16} />}
              验证
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
