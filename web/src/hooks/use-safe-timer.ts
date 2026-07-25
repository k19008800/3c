import { useRef, useEffect, useCallback } from 'react'

/**
 * 安全的 setTimeout Hook，自动清理
 * 
 * @example
 * const setTimeoutSafe = useSafeTimeout()
 * setTimeoutSafe(() => setMsg(''), 3000)
 */
export function useSafeTimeout() {
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      // 组件卸载时清理所有 setTimeout
      timeoutRefs.current.forEach(clearTimeout)
    }
  }, [])

  const setTimeoutSafe = useCallback((callback: () => void, delay: number) => {
    const id = setTimeout(() => {
      // 执行后从列表移除
      timeoutRefs.current = timeoutRefs.current.filter(t => t !== id)
      callback()
    }, delay)
    timeoutRefs.current.push(id)
    return id
  }, [])

  return setTimeoutSafe
}

/**
 * 安全的 setInterval Hook，自动清理
 */
export function useSafeInterval() {
  const intervalRefs = useRef<ReturnType<typeof setInterval>[]>([])

  useEffect(() => {
    return () => {
      intervalRefs.current.forEach(clearInterval)
    }
  }, [])

  const setIntervalSafe = useCallback((callback: () => void, delay: number) => {
    const id = setInterval(callback, delay)
    intervalRefs.current.push(id)
    return id
  }, [])

  return setIntervalSafe
}
