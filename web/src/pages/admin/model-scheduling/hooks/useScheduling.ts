import { useState, useCallback, useRef, useEffect } from 'react'
import { get } from '@/lib/api'
import type { SchedulingRealtime } from '@/types'

export function useScheduling() {
  const [data, setData] = useState<SchedulingRealtime | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<SchedulingRealtime>('/api/v1/admin/scheduling/realtime', {})
      setData(res)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const startPolling = useCallback((intervalMs: number = 15000) => {
    if (intervalRef.current) return
    setIsPolling(true)
    fetchData()
    intervalRef.current = setInterval(fetchData, intervalMs)
  }, [fetchData])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    data,
    loading,
    error,
    isPolling,
    fetchData,
    startPolling,
    stopPolling,
  }
}