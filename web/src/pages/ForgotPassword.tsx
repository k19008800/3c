import { useState } from 'react'
import { Link } from 'react-router-dom'
import { post } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Mail } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await post('/api/v1/auth/forgot-password', { email })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || '请求失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl text-center">
          <CheckCircle2 className="mx-auto text-green-500" size={48} />
          <h2 className="text-2xl font-bold mt-4 text-slate-900">邮件已发送</h2>
          <p className="text-slate-500 mt-2">
            密码重置链接已发送至 <strong className="text-slate-700">{email}</strong>
          </p>
          <p className="text-slate-400 text-sm mt-1">请检查您的邮箱，按照邮件提示完成密码重置</p>
          <Link
            to="/login"
            className="inline-block mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            返回登录
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl">
        <div className="text-center mb-8">
          <Mail className="mx-auto text-blue-500" size={40} />
          <h1 className="text-3xl font-bold text-slate-900 mt-3">忘记密码</h1>
          <p className="text-slate-500 mt-2">输入您的注册邮箱，我们将发送重置链接</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入注册邮箱"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            发送重置链接
          </button>

          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="text-blue-600 hover:underline">
              返回登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
