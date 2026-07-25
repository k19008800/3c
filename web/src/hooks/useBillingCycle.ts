// ============================================================
//  3cloud (3C) — 账单周期 Hook
//  获取当前账单周期概览数据
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { get } from '@/lib/api'

export interface BillingCycleData {
  // 周期信息
  periodStart: string
  periodEnd: string
  daysInMonth: number
  daysPassed: number
  progressPercent: number

  // 已出账金额（上月）
  billedAmount: string
  billedPeriodStart: string
  billedPeriodEnd: string

  // 待结算金额（本月）
  pendingAmount: string
  pendingCalls: number
  pendingTokens: number

  // 预估账单
  estimatedAmount: string
  estimationMethod: 'actual' | 'daily_average'
  estimatedDailyAvg: string

  // 充值信息
  totalRecharge: string
  rechargeCount: number

  // 环比变化
  momChangePercent: number

  // 消费趋势
  dailyTrend: Array<{
    date: string
    cost: string
    calls: number
  }>
}

export function useBillingCycle() {
  const [data, setData] = useState<BillingCycleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBillingCycle = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await get<BillingCycleData>('/api/v1/me/billing/current-period')
      setData(result)
    } catch (err: any) {
      setError(err.message || '获取账单周期数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBillingCycle()
  }, [fetchBillingCycle])

  return {
    data,
    loading,
    error,
    refresh: fetchBillingCycle,
  }
}
