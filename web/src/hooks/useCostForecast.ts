import { useState, useEffect, useCallback } from 'react'
import { get } from '@/lib/api'

/**
 * 成本预测数据类型
 */
export interface CostForecastData {
  balance: string
  last7DaysCost: string
  avgDailyCost: string
  monthToDateCost: string
  predictedRemainingCost: string
  predictedMonthTotal: string
  depletionDate: string | null
  warnings: string[]
  warningLevel: 'none' | 'low' | 'medium' | 'high'
  trend: 'increasing' | 'decreasing' | 'stable'
  dailySeries: Array<{ date: string; cost: number }>
  regression: {
    slope: string
    intercept: string
  }
}

/**
 * 成本预测 Hook
 * @param autoFetch 是否自动获取数据，默认 true
 * @returns forecast, loading, error, refetch
 */
export function useCostForecast(autoFetch = true) {
  const [forecast, setForecast] = useState<CostForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchForecast = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<CostForecastData>('/api/v1/me/stats/forecast')
      setForecast(data)
    } catch (err: any) {
      setError(err.message || '获取成本预测数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoFetch) {
      fetchForecast()
    }
  }, [autoFetch, fetchForecast])

  return {
    forecast,
    loading,
    error,
    refetch: fetchForecast,
  }
}
