import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '@/lib/api'
import type { UserProfile, LoginResponse } from '@/types'

interface AuthState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, captcha?: string, captchaSession?: string) => Promise<void>
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
    const res = await axios.post('/api/v1/auth/login', body)
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

    // 正常登录成功
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    setState({ user: data.user, isAuthenticated: true, isLoading: false })
    navigate('/')
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
    <AuthContext.Provider value={{ ...state, login, register, logout, getAccessToken }}>
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
