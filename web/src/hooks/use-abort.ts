/**
 * useAbortController - 请求取消 Hook
 * 用于 useEffect 中发起的 HTTP 请求，组件卸载时自动取消
 * 
 * 用法：
 * ```tsx
 * useEffect(() => {
 *   const ac = createAbortController();
 *   fetch('/api/data', { signal: ac.signal })
 *     .then(res => res.json())
 *     .then(setData)
 *     .catch(err => { if (err.name !== 'AbortError') console.error(err) });
 *   return () => ac.abort();
 * }, []);
 * ```
 */
import { useRef, useEffect, useCallback } from 'react'

export function useAbortController() {
  const controllerRef = useRef<AbortController | null>(null)

  const getSignal = useCallback(() => {
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController()
    }
    return controllerRef.current.signal
  }, [])

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  // 组件卸载时自动取消
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  return { getSignal, abort }
}

/**
 * useFetchWithAbort - 带取消的 fetch 封装
 * 自动处理 AbortError，避免卸载后 setState 警告
 */
export function useFetchWithAbort() {
  const { getSignal } = useAbortController()

  const fetchWithAbort = useCallback(async <T>(
    url: string,
    options?: RequestInit
  ): Promise<T | null> => {
    const signal = getSignal()
    try {
      const res = await fetch(url, { ...options, signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err: any) {
      if (err.name === 'AbortError') return null
      throw err
    }
  }, [getSignal])

  return fetchWithAbort
}
