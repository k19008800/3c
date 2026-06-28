import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2, AlertCircle } from 'lucide-react'
import CaptchaDialog from '@/components/ui/CaptchaDialog'

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaSession, setCaptchaSession] = useState<string | null>(null)
  const [captchaLoading, setCaptchaLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      // 需要验证码
      if (err.captchaSession) {
        setCaptchaSession(err.captchaSession)
        setError('检测到异常登录，请输入邮箱验证码')
      } else {
        setError(err.message || '登录失败，请检查邮箱和密码')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCaptchaSubmit = async (captchaCode: string, sessionId: string) => {
    setCaptchaLoading(true)
    try {
      await login(email, password, captchaCode, sessionId)
      setCaptchaSession(null)
    } catch (err: any) {
      // 验证码错误重新显示弹窗
      throw err
    } finally {
      setCaptchaLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">3Cloud</h1>
          <p className="text-slate-500 mt-2">AI Token 聚合平台</p>
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
              placeholder="请输入邮箱"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
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
            登录
          </button>

          <p className="text-center text-sm text-slate-500">
            还没有账号？{' '}
            <Link to="/register" className="text-blue-600 hover:underline">
              立即注册
            </Link>
          </p>
        </form>
      </div>

      {captchaSession && (
        <CaptchaDialog
          email={email}
          captchaSession={captchaSession}
          onSubmit={handleCaptchaSubmit}
          onCancel={() => setCaptchaSession(null)}
        />
      )}
    </div>
  )
}
