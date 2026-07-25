import { useState, useEffect, useCallback, useRef } from 'react'

// 请求缓存类型定义
interface QueryCache<T = any> {
  data: T | null
  error: Error | null
  timestamp: number
  expiresAt: number
}

// 请求状态
interface QueryState<T = any> {
  data: T | null
  error: Error | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  isSuccess: boolean
}

// Hook 配置选项
interface UseQueryOptions<T = any> {
  enabled?: boolean
  staleTime?: number // 缓存过期时间（毫秒）
  cacheTime?: number // 缓存保留时间（毫秒）
  retry?: number // 重试次数
  retryDelay?: number // 重试延迟（毫秒）
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  onSettled?: (data: T | null, error: Error | null) => void
}

// 全局请求缓存
const globalCache = new Map<string, QueryCache>()
const pendingRequests = new Map<string, Promise<any>>()
const abortControllers = new Map<string, AbortController>()

// 清理过期缓存
function cleanupCache() {
  const now = Date.now()
  for (const [key, cache] of globalCache) {
    if (cache.expiresAt < now) {
      globalCache.delete(key)
    }
  }
}

// 定期清理缓存（每5分钟）
setInterval(cleanupCache, 5 * 60 * 1000)

/**
 * 高级请求 Hook：提供缓存、去重和取消功能
 * 
 * @param key 请求的唯一标识符（通常是 URL + 参数）
 * @param fetcher 执行实际请求的函数
 * @param options 配置选项
 * @returns 请求状态和控制函数
 */
export function useQuery<T = any>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseQueryOptions<T> = {}
) {
  const {
    enabled = true,
    staleTime = 60 * 1000, // 默认1分钟过期
    cacheTime = 5 * 60 * 1000, // 默认5分钟缓存
    retry = 0,
    retryDelay = 1000,
    onSuccess,
    onError,
    onSettled
  } = options

  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    isLoading: true,
    isFetching: false,
    isError: false,
    isSuccess: false
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)

  // 检查缓存
  const checkCache = useCallback(() => {
    const cached = globalCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached
    }
    return null
  }, [key])

  // 发起请求
  const refetch = useCallback(async (force = false) => {
    // 如果禁用或已有相同请求正在进行中，返回pending的promise
    if (!enabled) return

    // 检查是否有正在进行的请求
    if (pendingRequests.has(key) && !force) {
      return pendingRequests.get(key)
    }

    // 如果不是强制刷新，检查缓存
    if (!force) {
      const cached = checkCache()
      if (cached) {
        setState({
          data: cached.data,
          error: cached.error,
          isLoading: false,
          isFetching: false,
          isError: !!cached.error,
          isSuccess: !cached.error
        })
        return Promise.resolve(cached.data)
      }
    }

    // 取消之前的请求
    if (abortControllers.has(key)) {
      abortControllers.get(key)?.abort()
    }

    // 创建新的 AbortController
    const controller = new AbortController()
    abortControllers.set(key, controller)
    abortControllerRef.current = controller

    setState(prev => ({
      ...prev,
      isLoading: true,
      isFetching: true,
      isError: false
    }))

    const requestPromise = (async () => {
      let lastError: Error | null = null
      
      for (let i = 0; i <= retry; i++) {
        try {
          const data = await fetcher()
          
          // 缓存成功结果
          globalCache.set(key, {
            data,
            error: null,
            timestamp: Date.now(),
            expiresAt: Date.now() + staleTime
          })

          setState({
            data,
            error: null,
            isLoading: false,
            isFetching: false,
            isError: false,
            isSuccess: true
          })

          onSuccess?.(data)
          onSettled?.(data, null)
          
          retryCountRef.current = 0
          return data
        } catch (error) {
          lastError = error as Error
          
          // 如果是中止错误，不重试
          if ((error as Error).name === 'AbortError') {
            throw error
          }

          // 如果是最后一次重试，记录错误
          if (i === retry) {
            // 缓存错误
            globalCache.set(key, {
              data: null,
              error: error as Error,
              timestamp: Date.now(),
              expiresAt: Date.now() + staleTime
            })

            setState({
              data: null,
              error: error as Error,
              isLoading: false,
              isFetching: false,
              isError: true,
              isSuccess: false
            })

            onError?.(error as Error)
            onSettled?.(null, error as Error)
            throw error
          }

          // 等待重试延迟
          if (i < retry) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)))
          }
        }
      }

      throw lastError
    })()

    // 存储请求 promise 用于去重
    pendingRequests.set(key, requestPromise)

    // 清理
    requestPromise.finally(() => {
      pendingRequests.delete(key)
      abortControllers.delete(key)
    })

    return requestPromise
  }, [key, fetcher, enabled, staleTime, retry, retryDelay, onSuccess, onError, onSettled, checkCache])

  // 取消请求
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllers.delete(key)
    pendingRequests.delete(key)
  }, [key])

  // 清理缓存
  const clearCache = useCallback(() => {
    globalCache.delete(key)
  }, [key])

  // 自动发起请求
  useEffect(() => {
    if (!enabled) return

    const cached = checkCache()
    if (cached) {
      setState({
        data: cached.data,
        error: cached.error,
        isLoading: false,
        isFetching: false,
        isError: !!cached.error,
        isSuccess: !cached.error
      })
    } else {
      refetch()
    }

    return () => {
      // 组件卸载时取消请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [key, enabled, refetch, checkCache])

  return {
    ...state,
    refetch: () => refetch(true),
    cancel,
    clearCache,
    // 快捷状态检查
    isIdle: !state.isLoading && !state.isFetching && !state.data && !state.error,
    // 数据操作
    setData: (data: T) => {
      setState(prev => ({ ...prev, data }))
      // 更新缓存
      globalCache.set(key, {
        data,
        error: null,
        timestamp: Date.now(),
        expiresAt: Date.now() + cacheTime
      })
    }
  }
}

/**
 * 预置的 API 请求 Hook
 */
export function useApiQuery<T = any>(
  url: string,
  options: RequestInit = {},
  queryOptions: UseQueryOptions<T> = {}
) {
  const fetcher = useCallback(async () => {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.json() as Promise<T>
  }, [url, options])

  return useQuery<T>(`api:${url}`, fetcher, queryOptions)
}

/**
 * 乐观更新 Hook
 */
export function useOptimisticMutation<T = any, R = any>(
  mutationFn: (variables: T) => Promise<R>,
  options: {
    onMutate?: (variables: T) => any
    onSuccess?: (data: R, variables: T, context: any) => void
    onError?: (error: Error, variables: T, context: any) => void
    onSettled?: (data: R | null, error: Error | null, variables: T, context: any) => void
  } = {}
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<R | null>(null)

  const mutate = useCallback(async (variables: T) => {
    setIsLoading(true)
    setError(null)
    
    let context: any
    try {
      // 乐观更新前的回调
      context = options.onMutate?.(variables)
      
      const result = await mutationFn(variables)
      setData(result)
      
      options.onSuccess?.(result, variables, context)
      options.onSettled?.(result, null, variables, context)
      
      return result
    } catch (err) {
      const error = err as Error
      setError(error)
      options.onError?.(error, variables, context)
      options.onSettled?.(null, error, variables, context)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [mutationFn, options])

  return {
    mutate,
    isLoading,
    error,
    data,
    isError: !!error,
    isSuccess: !!data && !error
  }
}

/**
 * 批量请求 Hook
 */
export function useQueries<T extends Record<string, any>>(
  queries: Record<string, {
    key: string
    fetcher: () => Promise<any>
    options?: UseQueryOptions
  }>
) {
  const results: Record<string, ReturnType<typeof useQuery>> = {}
  
  for (const [name, config] of Object.entries(queries)) {
    results[name] = useQuery(config.key, config.fetcher, config.options)
  }

  return {
    ...results,
    // 聚合状态
    isLoading: Object.values(results).some(r => r.isLoading),
    isFetching: Object.values(results).some(r => r.isFetching),
    isError: Object.values(results).some(r => r.isError),
    isSuccess: Object.values(results).every(r => r.isSuccess),
    // 批量操作
    refetchAll: () => Promise.all(Object.values(results).map(r => r.refetch())),
    cancelAll: () => Object.values(results).forEach(r => r.cancel()),
    clearAllCache: () => Object.values(results).forEach(r => r.clearCache())
  }
}

/**
 * 全局缓存工具函数
 */
export const queryCache = {
  get: <T = any>(key: string): T | null => {
    const cached = globalCache.get(key)
    return cached?.data as T ?? null
  },
  
  set: <T = any>(key: string, data: T, expiresIn = 60 * 1000) => {
    globalCache.set(key, {
      data,
      error: null,
      timestamp: Date.now(),
      expiresAt: Date.now() + expiresIn
    })
  },
  
  delete: (key: string) => {
    globalCache.delete(key)
  },
  
  clear: () => {
    globalCache.clear()
  },
  
  has: (key: string): boolean => {
    const cached = globalCache.get(key)
    return !!cached && cached.expiresAt > Date.now()
  }
}