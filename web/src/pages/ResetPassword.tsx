import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { post } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('密码长度至少为6位')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      await post('/api/v1/auth/reset-password', {
        token,
        newPassword,
        confirmPassword,
      })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || '密码重置失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 无 token → 显示链接无效
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl text-center">
          <AlertCircle className="mx-auto text-red-500" size={48} />
          <h2 className="text-2xl font-bold mt-4 text-slate-900">链接无效</h2>
          <p className="text-slate-500 mt-2">该重置链接无效或已过期，请重新申请</p>
          <Link
            to="/forgot-password"
            className="inline-block mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            重新申请
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl text-center">
          <CheckCircle2 className="mx-auto text-green-500" size={48} />
          <h2 className="text-2xl font-bold mt-4 text-slate-900">密码已重置</h2>
          <p className="text-slate-500 mt-2">您的密码已成功修改，请使用新密码登录</p>
          <Link
            to="/login"
            className="inline-block mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            去登录
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl">
        <div className="text-center mb-8">
          <KeyRound className="mx-auto text-blue-500" size={40} />
          <h1 className="text-3xl font-bold text-slate-900 mt-3">重置密码</h1>
          <p className="text-slate-500 mt-2">请输入您的新密码</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码（至少6位）"
              required
              minLength={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入新密码"
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
            重置密码
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
