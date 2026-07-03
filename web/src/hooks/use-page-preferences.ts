import { useState, useEffect, useCallback, useRef } from 'react'
import { get, put } from '@/lib/api'

const PREF_API = '/api/v1/preferences'

export function usePagePreferences(pageKey: string | undefined) {
  const [filters, setFilters] = useState<Record<string, any>>({})
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!pageKey) return
    setLoaded(false)
    get<Record<string, any>>(`${PREF_API}/${pageKey}`)
      .then(data => {
        if (mountedRef.current) {
          setFilters(data || {})
          setLoaded(true)
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoaded(true)
      })
  }, [pageKey])

  const updateFilter = useCallback((key: string, value: any) => {
    if (!pageKey) return
    setFilters(prev => {
      const next = { ...prev, [key]: value }
      return next
    })
    // 持久化放在外面，避免 updater 内执行副作用
  }, [pageKey])

  // 在 filters 变化后持久化（使用 ref 避免循环）
  const prevFiltersRef = useRef(filters)
  useEffect(() => {
    if (!pageKey || prevFiltersRef.current === filters) return
    prevFiltersRef.current = filters
    put(`${PREF_API}/${pageKey}`, { filters }).catch(() => {})
  }, [filters, pageKey])

  const saveAll = useCallback((f: Record<string, any>) => {
    if (!pageKey) return
    setFilters(f)
    put(`${PREF_API}/${pageKey}`, { filters: f }).catch(() => {})
  }, [pageKey])

  return { filters, loaded, updateFilter, saveAll }
}
