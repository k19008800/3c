/**
 * useTimeout - 安全 setTimeout Hook
 * 自动在组件卸载时清理，避免内存泄漏
 * 
 * 用法：
 * ```tsx
 * const { setTimeout: setSafeTimeout } = useTimeout()
 * setSafeTimeout(() => console.log('delayed'), 1000)
 * ```
 */
import { useRef, useEffect, useCallback } from 'react'

export function useTimeout() {
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const setTimeout = useCallback((fn: () => void, delay: number) => {
    const id = globalThis.setTimeout(() => {
      timersRef.current.delete(id)
      fn()
    }, delay)
    timersRef.current.add(id)
    return id
  }, [])

  const clearTimeout = useCallback((id: ReturnType<typeof setTimeout>) => {
    globalThis.clearTimeout(id)
    timersRef.current.delete(id)
  }, [])

  const clearAll = useCallback(() => {
    timersRef.current.forEach(id => globalThis.clearTimeout(id))
    timersRef.current.clear()
  }, [])

  useEffect(() => {
    return () => clearAll()
  }, [clearAll])

  return { setTimeout, clearTimeout, clearAll }
}

/**
 * useInterval - 安全 setInterval Hook
 * 自动在组件卸载时清理
 */
export function useInterval() {
  const timersRef = useRef<Set<ReturnType<typeof setInterval>>>(new Set())

  const setInterval = useCallback((fn: () => void, delay: number) => {
    const id = globalThis.setInterval(fn, delay)
    timersRef.current.add(id)
    return id
  }, [])

  const clearInterval = useCallback((id: ReturnType<typeof setInterval>) => {
    globalThis.clearInterval(id)
    timersRef.current.delete(id)
  }, [])

  const clearAll = useCallback(() => {
    timersRef.current.forEach(id => globalThis.clearInterval(id))
    timersRef.current.clear()
  }, [])

  useEffect(() => {
    return () => clearAll()
  }, [clearAll])

  return { setInterval, clearInterval, clearAll }
}
