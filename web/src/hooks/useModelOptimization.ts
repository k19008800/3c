// ============================================================
//  3cloud (3C) — 模型优化建议 Hook
//  获取用户的模型使用优化建议
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { get } from '@/lib/api'

export interface ModelOptimization {
  currentModel: string
  recommendedModel: string
  currentCost: number       // 元/百万 token
  recommendedCost: number
  savings: number           // 每月预估节省（元）
  savingsPercent: number    // 节省百分比
  capabilityMatch: number   // 能力匹配度 0-100
  reason: string
  usageCount: number        // 用户使用次数
  usageTokens: number       // 用户使用 token 数
}

export interface ModelOptimizationData {
  hasOptimizations: boolean
  optimizations: ModelOptimization[]
  totalSavings: number
  analysisPeriod: string
  message: string
}

interface UseModelOptimizationReturn {
  data: ModelOptimizationData | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useModelOptimization(): UseModelOptimizationReturn {
  const [data, setData] = useState<ModelOptimizationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOptimizations = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const json = await get<ModelOptimizationData>('/api/v1/me/stats/optimization')
      setData(json)
    } catch (err: any) {
      setError(err.message || '获取优化建议失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOptimizations()
  }, [fetchOptimizations])

  return {
    data,
    loading,
    error,
    refetch: fetchOptimizations,
  }
}
