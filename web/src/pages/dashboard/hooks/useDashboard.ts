import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogSummary, LoginHistoryItem, ApiKey, PaginatedData, ApiKeyCallStats } from '@/types'
import type { TimeRange, QuotaInfo, AggUsageStats, AggDailySeries, AggModelBreakdown, KeyActivity } from '../types'
import { getDateRange } from '../constants'

export function useDashboard(timeRange: TimeRange) {
  const [summary, setSummary] = useState<LogSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([])
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)

  const [usageOpen, setUsageOpen] = useState(false)
  const [usageTab, setUsageTab] = useState<'overview' | 'trends' | 'models' | 'compare'>('overview')

  const [aggStats, setAggStats] = useState<AggUsageStats | null>(null)
  const [aggDaily, setAggDaily] = useState<AggDailySeries[]>([])
  const [aggModels, setAggModels] = useState<AggModelBreakdown[]>([])
  const [aggLoading, setAggLoading] = useState(false)

  const [keyActivities, setKeyActivities] = useState<KeyActivity[]>([])
  const [keyActivityLoading, setKeyActivityLoading] = useState(true)
  const [apiKeyList, setApiKeyList] = useState<ApiKey[]>([])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { startDate, endDate } = getDateRange(timeRange)
      const params: Record<string, any> = { startDate, endDate }
      const data = await get<LogSummary>('/api/v1/logs/summary', params)
      setSummary(data)
    } catch (err: any) {
      setError(err.message || '获取统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  const fetchKeyActivities = useCallback(async () => {
    setKeyActivityLoading(true)
    try {
      const { startDate, endDate } = getDateRange(timeRange)
      const keysData = await get<PaginatedData<ApiKey>>('/api/v1/api-keys')
      const allKeys = keysData.list || []
      setApiKeyList(allKeys)
      const activeKeys = allKeys.filter((k) => k.status)

      if (activeKeys.length === 0) {
        setKeyActivities([])
        setKeyActivityLoading(false)
        return
      }

      const statsResults = await Promise.allSettled(
        activeKeys.map((key) =>
          get<ApiKeyCallStats>(`/api/v1/api-keys/${key.id}/stats`, { startDate, endDate })
        )
      )

      const activities: KeyActivity[] = []
      statsResults.forEach((result, idx) => {
        const key = activeKeys[idx]
        if (result.status === 'fulfilled' && result.value?.summary) {
          activities.push({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            callCount: result.value.summary.totalCalls || 0,
            totalTokens: result.value.summary.totalTokens || 0,
            totalCost: result.value.summary.totalCost || '0',
            successCount: result.value.summary.successCalls || 0,
            failedCount: result.value.summary.failedCalls || 0,
          })
        } else {
          activities.push({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            callCount: 0,
            totalTokens: 0,
            totalCost: '0',
            successCount: 0,
            failedCount: 0,
          })
        }
      })

      activities.sort((a, b) => b.callCount - a.callCount)
      setKeyActivities(activities)
    } catch {
      // silent
    } finally {
      setKeyActivityLoading(false)
    }
  }, [timeRange])

  const fetchAggregatedUsage = useCallback(async () => {
    setAggLoading(true)
    try {
      const days = timeRange === 'today' ? 1 : timeRange === 'week' ? 7 : 30
      const period = days === 1 ? '1d' : days === 7 ? '7d' : '30d'
      const [statsData, dailyData, modelData] = await Promise.all([
        get<any>('/api/v1/me/stats/usage', { period }),
        get<{ series: AggDailySeries[] }>('/api/v1/me/stats/daily', { days }),
        get<{ items: AggModelBreakdown[] }>('/api/v1/me/stats/by-model', { period, limit: 20 }),
      ])
      const stats: AggUsageStats = {
        totalCalls: statsData.totalCalls || 0,
        totalTokens: statsData.totalTokens || 0,
        totalCost: statsData.totalCost || '0',
        successCalls: statsData.successCalls || 0,
        failedCalls: (statsData.totalCalls || 0) - (statsData.successCalls || 0),
        successRate: statsData.successRate || 100,
      }
      setAggStats(stats)
      setAggDaily(dailyData.series || [])
      setAggModels(
        (modelData.items || []).sort((a: any, b: any) => Number(b.totalTokens) - Number(a.totalTokens))
      )
    } catch {
      setAggStats(null)
      setAggDaily([])
      setAggModels([])
    } finally {
      setAggLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [loginHistoryResult, quotaResult] = await Promise.allSettled([
          get<{ list: LoginHistoryItem[] }>('/api/v1/auth/security/login-history?limit=5'),
          get<{ userQuota: QuotaInfo | null; keyQuotas: any[] }>('/api/v1/me/quota')
        ])
        
        if (loginHistoryResult.status === 'fulfilled') {
          setLoginHistory(loginHistoryResult.value.list || [])
        }
        
        if (quotaResult.status === 'fulfilled' && quotaResult.value.userQuota) {
          const q = quotaResult.value.userQuota;
          setQuota({ ...q, usagePercent: q.quotaAmount ? Number((Number(q.usedAmount) / Number(q.quotaAmount)) * 100) : 0 });
        }
      } catch {
        // 静默失败
      } finally {
        setQuotaLoading(false)
      }
    }
    
    loadInitialData()
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchKeyActivities()
  }, [fetchKeyActivities])

  useEffect(() => {
    if (usageOpen) fetchAggregatedUsage()
  }, [usageOpen, fetchAggregatedUsage])

  return {
    summary,
    loading,
    error,
    loginHistory,
    quota,
    quotaLoading,
    usageOpen,
    setUsageOpen,
    usageTab,
    setUsageTab,
    aggStats,
    aggDaily,
    aggModels,
    aggLoading,
    keyActivities,
    keyActivityLoading,
    apiKeyList,
    fetchSummary,
    fetchKeyActivities,
    fetchAggregatedUsage,
  }
}