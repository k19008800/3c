import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import axios from 'axios'
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function VendorLogin() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/vendor/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('请输入邮箱')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post('/api/vendor/login', { email, password })
      const data = res.data

      if (data.code !== 0) {
        throw new Error(data.message || '登录失败')
      }

      // Store vendor JWT
      localStorage.setItem('accessToken', data.data.accessToken)
      localStorage.setItem('refreshToken', data.data.refreshToken)
      localStorage.setItem('user', JSON.stringify(data.data.user))

      // Redirect to vendor dashboard
      navigate('/vendor/dashboard')
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message
      setError(serverMsg || err.message || '登录失败，请检查邮箱和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-600 mb-4">
            <span className="text-2xl font-bold text-white">3C</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">供应商登录</h1>
          <p className="text-slate-500 mt-1 text-sm">3Cloud AI Token 聚合平台 · 供应商门户</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入供应商账号邮箱"
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 font-medium"
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            登录
          </button>

          <div className="text-center pt-2 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              还没有供应商账号?{' '}
              <Link to="/vendor/register" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">
                立即注册
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
