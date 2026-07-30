// ============================================================
//  3cloud (3C) — 轻量级国际化 Hook
//  支持中文/英文切换，层级路径访问，自动刷新
// ============================================================

import { useCallback, useSyncExternalStore } from 'react'

type LocaleMessages = Record<string, any>

const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

let currentLocale: Locale = (localStorage.getItem('locale') as Locale) || 'zh-CN'
let messages: LocaleMessages = {}
let listeners: Set<() => void> = new Set()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): Locale {
  return currentLocale
}

async function loadLocale(locale: Locale) {
  try {
    const mod = await import(`../locales/${locale}.json`)
    messages = mod.default || mod
  } catch {
    // fallback to empty
    messages = {}
  }
  listeners.forEach(l => l())
}

// 初始化加载
loadLocale(currentLocale)

// 路径访问：t('hero.title') => messages.hero.title
function translate(path: string, params?: Record<string, string | number>): string {
  const keys = path.split('.')
  let val: any = messages
  for (const key of keys) {
    if (val == null) return path
    val = val[key]
  }
  if (typeof val !== 'string') {
    // 尝试取第一个子节点的值（如果是数组或对象）
    return path
  }
  if (params) {
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  }
  return val
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const t = useCallback((path: string, params?: Record<string, string | number>) => {
    return translate(path, params)
  }, [])

  const setLocale = useCallback(async (newLocale: Locale) => {
    if (newLocale === currentLocale) return
    currentLocale = newLocale
    localStorage.setItem('locale', newLocale)
    await loadLocale(newLocale)
  }, [])

  const isZh = locale === 'zh-CN'

  return { locale, t, setLocale, locales: SUPPORTED_LOCALES, isZh }
}

// 非 React 环境使用
export function getT(): (path: string, params?: Record<string, string | number>) => string {
  return (path: string, params?: Record<string, string | number>) => translate(path, params)
}

export type { Locale }