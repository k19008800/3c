// ============================================================
//  3cloud (3C) — 主题 Context
//  管理主题状态，支持 light / dark / system 三种模式
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { get, patch } from '@/lib/api'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => Promise<void>
  loading: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// 获取系统主题偏好
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// 解析实际应用的主题
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme()
  }
  return theme
}

// 应用主题到 DOM
function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)

  // 更新 CSS 变量（Tailwind dark mode）
  if (resolved === 'dark') {
    root.style.colorScheme = 'dark'
  } else {
    root.style.colorScheme = 'light'
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [loading, setLoading] = useState(true)

  // 计算实际主题
  const resolvedTheme = resolveTheme(theme)

  // 从服务器加载用户主题偏好
  useEffect(() => {
    async function loadTheme() {
      try {
        // 先从 localStorage 读取缓存（快速响应）
        const cached = localStorage.getItem('theme') as Theme | null
        if (cached && ['light', 'dark', 'system'].includes(cached)) {
          setThemeState(cached)
          applyTheme(resolveTheme(cached))
        }

        // 从服务器获取最新设置
        const data = await get<{ theme: Theme }>('/api/v1/me/settings')
        if (data?.theme && ['light', 'dark', 'system'].includes(data.theme)) {
          setThemeState(data.theme)
          localStorage.setItem('theme', data.theme)
          applyTheme(resolveTheme(data.theme))
        }
      } catch (err) {
        // 未登录或请求失败，使用缓存或默认值
        console.warn('[Theme] Failed to load theme from server:', err)
      } finally {
        setLoading(false)
      }
    }

    loadTheme()
  }, [])

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      applyTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  // 设置主题
  const setTheme = useCallback(async (newTheme: Theme) => {
    // 立即更新 UI（乐观更新）
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
    applyTheme(resolveTheme(newTheme))

    // 保存到服务器
    try {
      await patch('/api/v1/me/settings', { theme: newTheme })
    } catch (err) {
      console.error('[Theme] Failed to save theme:', err)
      // 不回滚，保留本地设置
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
