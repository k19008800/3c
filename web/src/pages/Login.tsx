import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useSiteConfig } from '@/hooks/use-site-config'
import { Loader2, AlertCircle, Shield } from 'lucide-react'
import CaptchaDialog from '@/components/ui/CaptchaDialog'

export default function Login() {
  const { login, isAuthenticated, verify2FA } = useAuth()
  const { config: siteConfig } = useSiteConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaSession, setCaptchaSession] = useState<string | null>(null)
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)
  const [userId2FA, setUserId2FA] = useState<number | null>(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/console" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      // 需要 2FA 验证
      if (err.requires2FA) {
        setRequires2FA(true)
        setUserId2FA(err.userId)
      }
      // 需要验证码
      else if (err.captchaSession) {
        setCaptchaSession(err.captchaSession)
        setError('检测到异常登录，请输入邮箱验证码')
      } else {
        setError(err.message || '登录失败，请检查邮箱和密码')
      }
    } finally {
      setLoading(false)
    }
  }

  // 2FA 验证
  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setTwoFALoading(true)
    try {
      await verify2FA(userId2FA!, twoFACode)
    } catch (err: any) {
      setError(err.message || '验证失败')
    } finally {
      setTwoFALoading(false)
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
          {siteConfig?.site_logo_url ? (
            <img
              src={siteConfig.site_logo_url}
              alt={siteConfig.site_name || 'Logo'}
              className="h-10 mx-auto object-contain mb-3"
            />
          ) : null}
          <h1 className="text-3xl font-bold text-slate-900">{siteConfig?.site_name || '3Cloud'}</h1>
          <p className="text-slate-500 mt-2">AI Token 聚合平台</p>
        </div>

        {/* 2FA 验证表单 */}
        {requires2FA ? (
          <form onSubmit={handle2FAVerify} className="space-y-4">
            <div className="flex items-center justify-center mb-4">
              <Shield className="text-blue-600" size={48} />
            </div>
            <h2 className="text-lg font-semibold text-center text-slate-900 mb-2">
              双因素认证
            </h2>
            <p className="text-sm text-slate-500 text-center mb-4">
              请输入认证应用显示的 6 位验证码
            </p>
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <input
              type="text"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full px-4 py-3 text-center text-2xl font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={twoFALoading || twoFACode.length !== 6}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {twoFALoading && <Loader2 className="animate-spin" size={18} />}
              验证
            </button>
            <button
              type="button"
              onClick={() => {
                setRequires2FA(false)
                setUserId2FA(null)
                setTwoFACode('')
                setError('')
              }}
              className="w-full py-2 text-slate-600 hover:text-slate-800 transition"
            >
              返回登录
            </button>
          </form>
        ) : (
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
            <div className="text-right mt-1">
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                忘记密码?
              </Link>
            </div>
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
            还没有账号?{' '}
            <Link to="/register" className="text-blue-600 hover:underline">
              立即注册
            </Link>
          </p>
        </form>
        )}
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
