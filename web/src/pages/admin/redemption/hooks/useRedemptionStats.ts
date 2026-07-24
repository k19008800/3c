import { useState, useCallback, useEffect } from 'react'
import { get } from '@/lib/api'
import type { RedemptionStats } from '../types'

export function useRedemptionStats() {
  const [stats, setStats] = useState<RedemptionStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      setStats(await get<RedemptionStats>('/api/v1/redemption/stats'))
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, refetch: fetchStats }
}
