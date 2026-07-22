/**
 * usePersistedFilters — 页面状态持久化引擎
 *
 * 三层持久化策略（优先级从高到低）：
 * 1. URL searchParams — 分享/刷新/后退可用
 * 2. API /preferences — 跨会话服务器持久化（复用现有接口）
 * 3. defaults — 内置默认值
 *
 * 适用所有管理列表页 + 用户列表页（共 17 个页面）。
 *
 * @example
 * const { filters, setFilter, resetFilters, hasActiveFilters } = usePersistedFilters({
 *   storageKey: 'admin-vendors',
 *   defaults: { keyword: '', status: '', page: 1, pageSize: 20 },
 * })
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get, put } from '@/lib/api'

type FilterValue = string | number | boolean | undefined | null
type FilterRecord = Record<string, FilterValue>

interface PersistedFiltersOptions<T extends FilterRecord> {
  /** localStorage/API key，每个页面唯一 */
  storageKey: string
  /** 默认值 */
  defaults: T
  /** 哪些字段写入 URL（默认全部 keys） */
  urlParams?: (keyof T)[]
  /** 是否通过 API 持久化到服务端（默认 true） */
  persistToServer?: boolean
}

export function usePersistedFilters<T extends FilterRecord>({
  storageKey,
  defaults,
  urlParams: urlParamKeys,
  persistToServer = false, // 默认不写服务端，避免大量 PATCH 请求
}: PersistedFiltersOptions<T>) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [serverPrefs, setServerPrefs] = useState<Partial<T>>({})
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const mountedRef = useRef(true)

  const urlKeys = urlParamKeys ?? (Object.keys(defaults) as (keyof T)[])

  // ── 加载服务端偏好 ──
  useEffect(() => {
    if (!persistToServer) {
      setPrefsLoaded(true)
      return
    }
    mountedRef.current = true
    get<Record<string, any>>(`/api/v1/preferences/${storageKey}`)
      .then(data => {
        if (mountedRef.current) {
          setServerPrefs(data?.filters ?? {})
          setPrefsLoaded(true)
        }
      })
      .catch(() => {
        if (mountedRef.current) setPrefsLoaded(true)
      })
    return () => { mountedRef.current = false }
  }, [storageKey, persistToServer])

  // ── 从三层源合并 filters ──
  const filters = useMemo<T>(() => {
    const result: any = { ...defaults }

    // 层级 1: 服务端偏好（跨会话）
    for (const key of Object.keys(serverPrefs)) {
      if (serverPrefs[key as keyof T] !== undefined && serverPrefs[key as keyof T] !== null) {
        result[key] = serverPrefs[key as keyof T]
      }
    }

    // 层级 2: localStorage（同机器跨会话）
    try {
      const local = localStorage.getItem(`filters_${storageKey}`)
      if (local) {
        const parsed = JSON.parse(local)
        for (const key of Object.keys(parsed)) {
          if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
            result[key] = parsed[key]
          }
        }
      }
    } catch { /* ignore */ }

    // 层级 3: URL 参数（最高优先级）
    for (const key of urlKeys) {
      const val = searchParams.get(key as string)
      if (val !== null) {
        const dv = defaults[key]
        if (typeof dv === 'number') {
          result[key] = Number(val)
        } else if (typeof dv === 'boolean') {
          result[key] = val === 'true'
        } else {
          result[key] = val
        }
      }
    }

    return result as T
  }, [defaults, serverPrefs, urlKeys, searchParams, storageKey])

  // ── 持久化防抖 ref ──
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback((f: T) => {
    // localStorage
    try {
      localStorage.setItem(`filters_${storageKey}`, JSON.stringify(f))
    } catch { /* ignore */ }

    // URL params（只写 urlKeys 中的字段）
    const params = new URLSearchParams()
    for (const key of urlKeys) {
      const val = f[key as keyof T]
      if (val !== undefined && val !== null && val !== '' && val !== defaults[key] && val !== 0 && val !== false) {
        params.set(key as string, String(val))
      }
    }
    setSearchParams(params, { replace: true })

    // 服务端（防抖 2 秒）
    if (persistToServer) {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = setTimeout(() => {
        put(`/api/v1/preferences/${storageKey}`, { filters: f }).catch(() => {})
      }, 2000)
    }
  }, [storageKey, urlKeys, defaults, setSearchParams, persistToServer])

  // ── 函数式更新：避免闭包陷阱 ──
  // 使用 ref 追踪最新 filters，确保连续调用时拿到正确值
  const filtersRef = useRef(filters)
  useEffect(() => { filtersRef.current = filters }, [filters])

  const setFilter = useCallback((key: keyof T, value: FilterValue) => {
    const next = { ...filtersRef.current, [key]: value } as T
    // 如果修改的是筛选条件（非 page），自动重置页码
    if (key !== 'page' && key !== 'pageSize' && 'page' in defaults) {
      ;(next as Record<string, unknown>).page = 1
    }
    persist(next)
  }, [persist, defaults])

  const setFilters = useCallback((partial: Partial<T>) => {
    const next = { ...filtersRef.current, ...partial } as T
    // 如果修改了 pageSize 但没有显式设置 page，自动重置
    if ('pageSize' in partial && !('page' in partial) && 'page' in defaults) {
      ;(next as Record<string, unknown>).page = 1
    }
    persist(next)
  }, [persist, defaults])

  const resetFilters = useCallback(() => {
    persist(defaults)
  }, [persist, defaults])

  const hasActiveFilters = useMemo(() => {
    for (const key of Object.keys(defaults)) {
      const dv = defaults[key]
      const fv = filters[key]
      if (fv !== dv && fv !== '' && fv !== undefined && fv !== null) return true
    }
    return false
  }, [defaults, filters])

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    hasActiveFilters,
    loaded: prefsLoaded,
  }
}
