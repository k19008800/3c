import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { LogItem, LogSummary, PaginatedData, ApiKey } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import { useColumnPrefs } from '@/hooks/use-column-prefs'
import LogDetailDrawer from '@/components/logs/LogDetailDrawer'
import LogStatsCards from '@/components/logs/LogStatsCards'
import LogTrendChart from '@/components/logs/LogTrendChart'
import LogModelChart from '@/components/logs/LogModelChart'
import LogExportButton from '@/components/logs/LogExportButton'
import LogAnomaliesPanel from '@/components/logs/LogAnomaliesPanel'
import LogsFilter from '@/components/logs/LogsFilter'
import LogsTable from '@/components/logs/LogsTable'
import KeyComparison from '@/components/logs/KeyComparison'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw,
  BarChart3,
} from 'lucide-react'

interface ErrorPattern {
  pattern: string
  count: number
  percentage: number
}

interface KeyComparisonData {
  keyId: number
  keyName: string
  summary: LogSummary | null
  loading: boolean
  error: string
}

// ── 调用日志（用户端）─-
//
// 【业务说明】
//   用户的 API 调用审计记录，支持按模型名称、API Key、状态、日期范围筛选。
//   提供统计卡片（总调用/成功/失败/Token/消费/平均耗时）、趋势图表、模型用量分布图。
//   延迟色标：绿色(<500ms) / 黄色(500ms-2s) / 红色(>2s)。
//   错误洞察面板：当筛选 status=failed 时，显示 Top 3 错误模式及计数。
//   Key 对比：选择两个 API Key 进行并排用量对比。
//
// 【权限要求】登录即可查看个人日志
// 【数据来源】GET /api/v1/logs, GET /api/v1/logs/summary, GET /api/v1/logs/trends
// 【导出】GET /api/v1/logs/export（CSV）

export default function Logs() {
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
  const { isVisible, toggleColumn } = useColumnPrefs('logs_table')
  const [showColumnMenu, setShowColumnMenu] = useState(false)

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



  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">调用日志</h1>
        <div className="flex items-center gap-3">
          {/* Auto refresh toggle */}
          <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            自动刷新
          </label>
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <LogExportButton filters={{ modelName, status: statusFilter, startDate, endDate, apiKeyId: apiKeyId || undefined }} />
          <button
            onClick={() => { fetchLogs(); fetchSummary() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <LogStatsCards summary={summary} loading={summaryLoading} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LogTrendChart />
        <LogModelChart
          startDate={startDate || undefined}
          endDate={endDate || undefined}
        />
      </div>

      {/* Cost Anomalies Panel */}
      <LogAnomaliesPanel days={7} />

      {/* Error Insight Panel */}
      {statusFilter === 'failed' && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={20} className="text-red-500" />
            <h2 className="text-lg font-semibold text-slate-900">错误分析</h2>
          </div>
          {errorInsightLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : errorPatterns.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">暂无错误数据可供分析</p>
          ) : (
            <div className="space-y-3">
              {errorPatterns.map((ep, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-red-200 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-red-700">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-red-800 truncate" title={ep.pattern}>
                        {ep.pattern}
                      </p>
                      <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {ep.count} 次 ({ep.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-1.5 bg-red-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ep.percentage)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key Comparison */}
      <KeyComparison
        showComparison={showComparison}
        setShowComparison={setShowComparison}
        compareKeyA={compareKeyA}
        setCompareKeyA={setCompareKeyA}
        compareKeyB={compareKeyB}
        setCompareKeyB={setCompareKeyB}
        apiKeys={apiKeys}
        comparisonDataA={comparisonDataA}
        comparisonDataB={comparisonDataB}
      />

      {/* Filters */}
      <LogsFilter
        modelName={modelName}
        setModelName={setModelName}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        apiKeyId={apiKeyId}
        setApiKeyId={setApiKeyId}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        apiKeys={apiKeys}
        updateFilter={updateFilter}
        resetFilters={resetFilters}
        showColumnMenu={showColumnMenu}
        setShowColumnMenu={setShowColumnMenu}
        isVisible={isVisible}
        toggleColumn={toggleColumn}
      />

      {/* Table */}
      <LogsTable
        logs={logs}
        total={total}
        loading={loading}
        error={error}
        isVisible={isVisible}
        setDetailId={setDetailId}
      />

      {/* Pagination */}
      {total > 0 && (
        <PaginationBar
          page={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          total={total}
          totalPages={totalPages}
        />
      )}

      {/* Detail Drawer */}
      <LogDetailDrawer logId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}