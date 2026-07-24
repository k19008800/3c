// useRedemptionStats - 统计数据加载

import { useState, useEffect } from 'react'
import { get } from '@/lib/api'
import type { RedemptionStats } from '../types'

export function useRedemptionStats() {
  const [stats, setStats] = useState<RedemptionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStats = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<RedemptionStats>('/api/v1/admin/redemption/stats')
      setStats(data)
    } catch (err: any) {
      setError(err.message || '加载统计失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  return { stats, loading, error, refresh: loadStats }
}
