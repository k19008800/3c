import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogItem, LogSummary, PaginatedData, ApiKey } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import type { ErrorPattern, KeyComparisonData } from '../types'

export function useLogs() {
  // ── Data state ──
  const [logs, setLogs] = useState<LogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<LogSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])

  // ── Filters ──
  const [modelName, setModelName] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [apiKeyId, setApiKeyId] = useState<number | ''>('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // ── Error insight ──
  const [errorPatterns, setErrorPatterns] = useState<ErrorPattern[]>([])
  const [errorInsightLoading, setErrorInsightLoading] = useState(false)

  // ── Key comparison ──
  const [showComparison, setShowComparison] = useState(false)
  const [compareKeyA, setCompareKeyA] = useState<number | ''>('')
  const [compareKeyB, setCompareKeyB] = useState<number | ''>('')
  const [comparisonDataA, setComparisonDataA] = useState<KeyComparisonData | null>(null)
  const [comparisonDataB, setComparisonDataB] = useState<KeyComparisonData | null>(null)

  // ── Saved prefs ──
  const { filters: savedFilters, loaded: prefsLoaded, updateFilter, saveAll } = usePagePreferences('user_logs')

  // ── Restore saved filters ──
  useEffect(() => {
    if (!prefsLoaded) return
    const s = savedFilters
    if (s.modelName) setModelName(s.modelName)
    if (s.status) setStatusFilter(s.status)
    if (s.startDate) setStartDate(s.startDate)
    if (s.endDate) setEndDate(s.endDate)
    if (s.apiKeyId) setApiKeyId(s.apiKeyId)
    if (s.sortOrder) setSortOrder(s.sortOrder)
  }, [prefsLoaded])

  // ── Load API Keys for filter dropdown ──
  useEffect(() => {
    get<PaginatedData<ApiKey>>('/api/v1/api-keys')
      .then(d => setApiKeys(d.list || []))
      .catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / pageSize)

  // ── Fetch logs ──
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (modelName) params.modelName = modelName
      if (statusFilter) params.status = statusFilter
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (apiKeyId !== '') params.apiKeyId = apiKeyId
      params.sortBy = 'createdAt'
      params.sortOrder = sortOrder
      const data = await get<PaginatedData<LogItem>>('/api/v1/logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, modelName, statusFilter, startDate, endDate, apiKeyId, sortOrder])

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const params: Record<string, any> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const data = await get<LogSummary>('/api/v1/logs/summary', params)
      setSummary(data)
    } catch {
      // silent
    } finally {
      setSummaryLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // ── Error insight: detect patterns when filtering by failed status ──
  useEffect(() => {
    if (statusFilter !== 'failed') {
      setErrorPatterns([])
      return
    }

    setErrorInsightLoading(true)
    const params: Record<string, any> = { status: 'failed', pageSize: 200, sortBy: 'createdAt', sortOrder: 'desc' }
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate

    get<PaginatedData<LogItem>>('/api/v1/logs', params)
      .then((data) => {
        const failedLogs = data.list.filter((l) => l.status === 'failed' && l.errorMessage)
        const patternMap = new Map<string, number>()

        for (const log of failedLogs) {
          const msg = log.errorMessage || ''
          // Normalize: extract key pattern (first line or main error type)
          let pattern = msg.split('\n')[0].trim()
          // Truncate very long patterns
          if (pattern.length > 80) {
            pattern = pattern.slice(0, 80) + '...'
          }
          // Try to collapse dynamic parts like IDs, timestamps, etc.
          pattern = pattern
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
            .replace(/\d{10,13}/g, '<timestamp>')
            .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, '<ip>')
            .replace(/\b[a-f0-9]{32,64}\b/gi, '<hash>')

          patternMap.set(pattern, (patternMap.get(pattern) || 0) + 1)
        }

        const patterns: ErrorPattern[] = Array.from(patternMap.entries())
          .map(([pattern, count]) => ({
            pattern,
            count,
            percentage: failedLogs.length > 0 ? (count / failedLogs.length) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)

        setErrorPatterns(patterns)
      })
      .catch(() => { /* silent */ })
      .finally(() => setErrorInsightLoading(false))
  }, [statusFilter, startDate, endDate])

  // ── Key comparison data fetching ──
  useEffect(() => {
    if (!showComparison) {
      setComparisonDataA(null)
      setComparisonDataB(null)
      return
    }

    const params: Record<string, any> = {}
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate

    // Fetch comparison for Key A
    if (compareKeyA !== '') {
      setComparisonDataA((prev) => prev && prev.keyId === compareKeyA ? prev : { keyId: compareKeyA as number, keyName: apiKeys.find(k => k.id === compareKeyA)?.name || `Key #${compareKeyA}`, summary: null, loading: true, error: '' })
      get<LogSummary>('/api/v1/logs/summary', { ...params, apiKeyId: compareKeyA })
        .then((data) => {
          setComparisonDataA((prev) => prev ? { ...prev, summary: data, loading: false } : null)
        })
        .catch((err) => {
          setComparisonDataA((prev) => prev ? { ...prev, error: err.message || '获取失败', loading: false } : null)
        })
    } else {
      setComparisonDataA(null)
    }

    // Fetch comparison for Key B
    if (compareKeyB !== '') {
      setComparisonDataB((prev) => prev && prev.keyId === compareKeyB ? prev : { keyId: compareKeyB as number, keyName: apiKeys.find(k => k.id === compareKeyB)?.name || `Key #${compareKeyB}`, summary: null, loading: true, error: '' })
      get<LogSummary>('/api/v1/logs/summary', { ...params, apiKeyId: compareKeyB })
        .then((data) => {
          setComparisonDataB((prev) => prev ? { ...prev, summary: data, loading: false } : null)
        })
        .catch((err) => {
          setComparisonDataB((prev) => prev ? { ...prev, error: err.message || '获取失败', loading: false } : null)
        })
    } else {
      setComparisonDataB(null)
    }
  }, [showComparison, compareKeyA, compareKeyB, startDate, endDate, apiKeys])

  // ── Auto refresh ──
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchLogs()
      fetchSummary()
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs, fetchSummary])

  // ── Filter change helpers ──
  const changeFilter = (key: string, value: any, setter: (v: any) => void) => {
    setter(value)
    updateFilter(key, value)
    setPage(1)
  }

  const resetFilters = () => {
    setModelName('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
    setApiKeyId('')
    setSortOrder('desc')
    saveAll({})
    setPage(1)
  }

  return {
    // Data state
    logs,
    total,
    page,
    pageSize,
    loading,
    error,
    summary,
    summaryLoading,
    detailId,
    apiKeys,
    setDetailId,
    
    // Filters
    modelName,
    statusFilter,
    startDate,
    endDate,
    apiKeyId,
    sortOrder,
    autoRefresh,
    setModelName,
    setStatusFilter,
    setStartDate,
    setEndDate,
    setApiKeyId,
    setSortOrder,
    setAutoRefresh,
    
    // Error insight
    errorPatterns,
    errorInsightLoading,
    
    // Key comparison
    showComparison,
    compareKeyA,
    compareKeyB,
    comparisonDataA,
    comparisonDataB,
    setShowComparison,
    setCompareKeyA,
    setCompareKeyB,
    
    // Pagination
    totalPages,
    setPage,
    setPageSize,
    
    // Functions
    fetchLogs,
    fetchSummary,
    changeFilter,
    resetFilters,
  }
}