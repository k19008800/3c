import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * 通用异步数据获取 Hook
 *
 * 消除 53+ 个页面中重复的 loading/error/data 状态管理模式。
 *
 * @example
 * const { data, loading, error, refetch } = useAsyncData(
 *   () => get('/api/v1/something', { page }),
 *   [page]
 * )
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: any[],
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const execute = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetcher()
      if (mountedRef.current) {
        setData(result)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '请求失败'
      if (mountedRef.current) {
        setError(message)
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    execute()
  }, [execute])

  return { data, loading, error, refetch: execute }
}
