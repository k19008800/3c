import { useRef, useCallback, useEffect } from 'react'

/**
 * AbortController Hook - 请求去重和取消
 * 
 * 自动取消上一个未完成的请求，避免竞态条件
 * 
 * @example
 * const { abortableFetch, abortAll } = useAbortController()
 * 
 * // 自动取消上一个请求
 * const data = await abortableFetch('/api/data', { signal })
 * 
 * // 组件卸载时自动取消所有请求
 */
export function useAbortController() {
  const controllerRef = useRef<AbortController | null>(null)

  // 组件卸载时取消所有请求
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
    }
  }, [])

  // 创建新的 AbortController（自动取消上一个）
  const createAbortController = useCallback(() => {
    // 取消上一个请求
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    // 创建新的
    controllerRef.current = new AbortController()
    return controllerRef.current
  }, [])

  // 取消所有请求
  const abortAll = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort()
      controllerRef.current = null
    }
  }, [])

  // 可中断的 fetch
  const abortableFetch = useCallback(async <T>(
    fetcher: (signal: AbortSignal) => Promise<T>
  ): Promise<T> => {
    const controller = createAbortController()
    try {
      return await fetcher(controller.signal)
    } finally {
      // 请求完成后清理
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [createAbortController])

  return {
    createAbortController,
    abortAll,
    abortableFetch,
    get signal() {
      return controllerRef.current?.signal
    }
  }
}

/**
 * 请求去重 Hook
 * 
 * 防止短时间内重复发送相同请求
 * 
 * @example
 * const { dedupeFetch } = useRequestDedupe()
 * const data = await dedupeFetch('key', () => fetch('/api/data'))
 */
export function useRequestDedupe() {
  const pendingRequests = useRef<Map<string, Promise<any>>>(new Map())

  const dedupeFetch = useCallback(async <T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> => {
    // 检查是否有相同的请求正在进行
    const pending = pendingRequests.current.get(key)
    if (pending) {
      return pending
    }

    // 发起新请求
    const promise = fetcher()
    pendingRequests.current.set(key, promise)

    try {
      const result = await promise
      return result
    } finally {
      // 请求完成后移除
      pendingRequests.current.delete(key)
    }
  }, [])

  // 清理所有待处理请求
  const clearPending = useCallback(() => {
    pendingRequests.current.clear()
  }, [])

  return { dedupeFetch, clearPending }
}
