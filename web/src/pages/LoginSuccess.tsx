import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

export default function LoginSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    const expiresIn = searchParams.get('expires_in')

    if (!accessToken || !refreshToken) {
      setStatus('error')
      setErrorMsg('缺少登录凭证')
      return
    }

    try {
      loginWithToken(accessToken, refreshToken, Number(expiresIn) || 7200)
      setStatus('success')
      setTimeout(() => navigate('/console', { replace: true }), 1500)
    } catch (e: any) {
      setStatus('error')
      setErrorMsg(e?.message || '登录失败')
    }
  }, [searchParams, loginWithToken, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-2xl text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-slate-600">正在登录...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="mt-4 text-green-600 font-medium">登录成功，正在跳转...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="mt-4 text-red-600 font-medium">{errorMsg}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              返回登录
            </button>
          </>
        )}
      </div>
    </div>
  )
}