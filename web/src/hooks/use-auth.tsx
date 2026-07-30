import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '@/lib/api'
import type { UserProfile } from '@/types'

interface AuthState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, captcha?: string, captchaSession?: string) => Promise<void>
  loginWithToken: (accessToken: string, refreshToken: string, expiresIn: number) => Promise<void>
  verify2FA: (userId: number, token: string) => Promise<void>
  register: (email: string, password: string, confirmPassword: string) => Promise<void>
  logout: () => void
  getAccessToken: () => string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })
  const navigate = useNavigate()

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: UserProfile }>('/api/v1/auth/me')
      setState({ user: res.data.data, isAuthenticated: true, isLoading: false })
      return res.data.data
    } catch {
      setState({ user: null, isAuthenticated: false, isLoading: false })
      return null
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      fetchMe()
    } else {
      setState((s) => ({ ...s, isLoading: false }))
    }
  }, [fetchMe])

  const login = useCallback(async (email: string, password: string, captcha?: string, captchaSession?: string) => {
    const body: any = { email, password }
    if (captcha && captchaSession) {
      body.captcha = captcha
      body.captchaSession = captchaSession
    }

    // 使用原始 axios 发登录请求（不经过 api.ts 的 401 拦截）
    let res
    try {
      res = await axios.post('/api/v1/auth/login', body)
    } catch (err: any) {
      // 提取服务端返回的真实错误信息（例如风控封禁、验证码要求等）
      const serverMsg = err?.response?.data?.message
      if (serverMsg) {
        throw new Error(serverMsg)
      }
      throw new Error(err.message || '登录失败')
    }
    const responseData = res.data

    if (responseData.code !== 0) {
      throw new Error(responseData.message || '登录失败')
    }

    const data = responseData.data

    // 需要验证码
    if (data.captchaRequired) {
      if (!captcha) {
        const err: any = new Error('CAPTCHA_REQUIRED')
        err.captchaSession = data.captchaSession
        err.message = data.message || '需要验证码'
        throw err
      }
      // 有 captcha 但后端还说 captchaRequired = 验证码错误
      throw new Error('验证码错误或已过期')
    }

    // 需要 2FA 验证
    if (data.requires2FA) {
      const err: any = new Error('2FA_REQUIRED')
      err.requires2FA = true
      err.userId = data.userId
      throw err
    }

    // 正常登录成功
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    setState({ user: data.user, isAuthenticated: true, isLoading: false })
    navigate('/console')
  }, [navigate])

  // 直接使用 token 登录（第三方 OAuth 回调用）
  const loginWithToken = useCallback(async (accessToken: string, refreshToken: string, expiresIn: number) => {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    // 获取用户信息
    try {
      const res = await api.get('/api/v1/auth/me')
      if (res.data) {
        localStorage.setItem('user', JSON.stringify(res.data))
        setState({ user: res.data, isAuthenticated: true, isLoading: false })
      } else {
        setState({ user: null, isAuthenticated: true, isLoading: false })
      }
    } catch {
      setState({ user: null, isAuthenticated: true, isLoading: false })
    }
  }, [])

  // 2FA 验证
  const verify2FA = useCallback(async (userId: number, token: string) => {
    const res = await axios.post('/api/v1/auth/2fa/verify', { userId, token })
    const responseData = res.data

    if (responseData.code !== 0) {
      throw new Error(responseData.message || '验证失败')
    }

    const data = responseData.data
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    setState({ user: data.user, isAuthenticated: true, isLoading: false })
    navigate('/console')
  }, [navigate])

  const register = useCallback(async (email: string, password: string, confirmPassword: string) => {
    const res = await api.post('/api/v1/auth/register', { email, password, confirmPassword })
    return res.data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setState({ user: null, isAuthenticated: false, isLoading: false })
    navigate('/login')
  }, [navigate])

  const getAccessToken = useCallback(() => {
    return localStorage.getItem('accessToken')
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithToken, verify2FA, register, logout, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
