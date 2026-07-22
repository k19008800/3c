/**
 * AuthContext 拆分优化
 * 将用户状态和操作方法分离，减少不必要的重渲染
 * 
 * 原理：
 * - AuthUserContext 只包含用户状态（user/isAuthenticated/isLoading）
 * - AuthActionsContext 包含操作方法（login/register/logout）
 * - 大部分组件只需要 user 状态，不需要监听 login/logout 变化
 * - 这样 login 函数变化不会触发只读取 user 的组件重渲染
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '@/lib/api'
import type { UserProfile } from '@/types'

// ─────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────

interface AuthUserState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthActions {
  login: (email: string, password: string, captcha?: string, captchaSession?: string) => Promise<void>
  register: (email: string, password: string, confirmPassword: string) => Promise<void>
  logout: () => void
  getAccessToken: () => string | null
  refreshUser: () => Promise<UserProfile | null>
}

// ─────────────────────────────────────────────────────────
//  Contexts
// ─────────────────────────────────────────────────────────

/** 用户状态 Context — 只包含状态，不包含方法 */
const AuthUserContext = createContext<AuthUserState | undefined>(undefined)

/** 操作方法 Context — 只包含方法，不包含状态 */
const AuthActionsContext = createContext<AuthActions | undefined>(undefined)

// ─────────────────────────────────────────────────────────
//  Provider
// ─────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userState, setUserState] = useState<AuthUserState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })
  const navigate = useNavigate()

  // ── 用户刷新 ──
  const refreshUser = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const res = await api.get<{ code: number; data: UserProfile }>('/api/v1/auth/me')
      setUserState({ user: res.data.data, isAuthenticated: true, isLoading: false })
      return res.data.data
    } catch {
      setUserState({ user: null, isAuthenticated: false, isLoading: false })
      return null
    }
  }, [])

  // ── 初始化 ──
  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      refreshUser()
    } else {
      setUserState(s => ({ ...s, isLoading: false }))
    }
  }, [refreshUser])

  // ── 登录 ──
  const login = useCallback(async (
    email: string,
    password: string,
    captcha?: string,
    captchaSession?: string
  ) => {
    const body: any = { email, password }
    if (captcha && captchaSession) {
      body.captcha = captcha
      body.captchaSession = captchaSession
    }

    let res
    try {
      res = await axios.post('/api/v1/auth/login', body)
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message
      if (serverMsg) throw new Error(serverMsg)
      throw new Error(err.message || '登录失败')
    }

    const responseData = res.data
    if (responseData.code !== 0) {
      throw new Error(responseData.message || '登录失败')
    }

    const data = responseData.data

    if (data.captchaRequired) {
      if (!captcha) {
        const err: any = new Error('CAPTCHA_REQUIRED')
        err.captchaSession = data.captchaSession
        err.message = data.message || '需要验证码'
        throw err
      }
      throw new Error('验证码错误或已过期')
    }

    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUserState({ user: data.user, isAuthenticated: true, isLoading: false })
    navigate('/console')
  }, [navigate])

  // ── 注册 ──
  const register = useCallback(async (
    email: string,
    password: string,
    confirmPassword: string
  ) => {
    const res = await api.post('/api/v1/auth/register', { email, password, confirmPassword })
    return res.data
  }, [])

  // ── 登出 ──
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setUserState({ user: null, isAuthenticated: false, isLoading: false })
    navigate('/login')
  }, [navigate])

  // ── Token 获取 ──
  const getAccessToken = useCallback(() => {
    return localStorage.getItem('accessToken')
  }, [])

  // ── Actions 对象（稳定引用）──
  const actions = useMemo(() => ({
    login,
    register,
    logout,
    getAccessToken,
    refreshUser,
  }), [login, register, logout, getAccessToken, refreshUser])

  return (
    <AuthUserContext.Provider value={userState}>
      <AuthActionsContext.Provider value={actions}>
        {children}
      </AuthActionsContext.Provider>
    </AuthUserContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────
//  Hooks
// ─────────────────────────────────────────────────────────

/** 获取用户状态（推荐：大部分组件只需要这个） */
export function useAuthUser(): AuthUserState {
  const context = useContext(AuthUserContext)
  if (!context) {
    throw new Error('useAuthUser must be used within an AuthProvider')
  }
  return context
}

/** 获取操作方法（只在需要登录/登出时使用） */
export function useAuthActions(): AuthActions {
  const context = useContext(AuthActionsContext)
  if (!context) {
    throw new Error('useAuthActions must be used within an AuthProvider')
  }
  return context
}

/** 兼容旧 API：同时获取状态和方法 */
export function useAuth(): AuthUserState & AuthActions {
  const userState = useAuthUser()
  const actions = useAuthActions()
  return { ...userState, ...actions }
}

// ─────────────────────────────────────────────────────────
//  导出旧 Context（兼容）
// ─────────────────────────────────────────────────────────

export const AuthContext = AuthUserContext
