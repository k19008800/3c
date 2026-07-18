import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import { AlertCircle } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  type EnterpriseUser, type EnterpriseOverview, type TopConsumer,
  type DaySeries, type ModelBreakdown, type FinanceData, type ActivityData,
} from './enterprise/types'
import AnalysisOverview from './enterprise/AnalysisOverview'
import { EnterpriseSearch, DetailPanel } from './enterprise/EnterpriseList'

export default function EnterpriseAnalysis() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<EnterpriseUser[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<EnterpriseUser | null>(null)
  const [trends, setTrends] = useState<DaySeries[] | null>(null)
  const [loadingTrend, setLoadingTrend] = useState(false)
  const [error, setError] = useState('')
  const [trendDimension, setTrendDimension] = useState('calls')
  const [daysRange, setDaysRange] = useState(30)
  const [statusFilter, setStatusFilter] = useState('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [activeTab, setActiveTab] = useState('analysis')
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdown[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [finance, setFinance] = useState<FinanceData | null>(null)
  const [loadingFinance, setLoadingFinance] = useState(false)
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [overview, setOverview] = useState<EnterpriseOverview | null>(null)
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([])
  const [enterpriseTrend, setEnterpriseTrend] = useState<DaySeries[] | null>(null)

  // ── 加载全局看板数据 ──
  useEffect(() => {
    if (selected) return
    loadOverview()
    loadTopConsumers()
    loadEnterpriseTrend()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const loadOverview = async () => {
    try {
      const data = await get<EnterpriseOverview>('/api/v1/admin/dashboard/enterprise-overview')
      setOverview(data)
    } catch { /* ignore */ }
  }

  const loadTopConsumers = async () => {
    try {
      const data = await get<{ topConsumers: TopConsumer[] }>('/api/v1/admin/dashboard/top-consumers')
      setTopConsumers((data.topConsumers ?? []).filter(c => c.userType === 'enterprise').slice(0, 10))
    } catch { /* ignore */ }
  }

  const loadEnterpriseTrend = async () => {
    try {
      const data = await get<{ series: DaySeries[] }>('/api/v1/admin/dashboard/trends', { days: String(daysRange), userType: 'enterprise' })
      setEnterpriseTrend(data.series)
    } catch { /* ignore */ }
  }

  const loadModelBreakdown = useCallback(async (userId: number, days: number) => {
    setLoadingModels(true)
    try {
      const data = await get<ModelBreakdown[]>('/api/v1/admin/dashboard/enterprise-model-breakdown', {
        userId: String(userId), days: String(days),
      })
      setModelBreakdown(data)
    } catch { setModelBreakdown([]) } finally { setLoadingModels(false) }
  }, [])

  const loadFinance = useCallback(async (userId: number, days: number) => {
    setLoadingFinance(true)
    try {
      const data = await get<FinanceData>('/api/v1/admin/dashboard/enterprise-finance', {
        userId: String(userId), days: String(days),
      })
      setFinance(data)
    } catch { setFinance(null) } finally { setLoadingFinance(false) }
  }, [])

  const loadActivity = useCallback(async (userId: number, days: number) => {
    setLoadingActivity(true)
    try {
      const data = await get<ActivityData>('/api/v1/admin/dashboard/enterprise-activity', {
        userId: String(userId), days: String(days),
      })
      setActivity(data)
    } catch { setActivity(null) } finally { setLoadingActivity(false) }
  }, [])

  // ── 搜索防抖 ──
  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const params: Record<string, string> = { keyword: query, limit: '15' }
        if (statusFilter) params.status = statusFilter
        const data = await get<EnterpriseUser[]>('/api/v1/admin/dashboard/enterprise-users', params)
        setSuggestions(data)
        setShowSuggestions(true)
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, statusFilter])

  // ── 数据获取 ──
  const fetchTrend = useCallback(async (userId: number, days: number) => {
    setLoadingTrend(true)
    setError('')
    try {
      const data = await get<{ series: DaySeries[] }>('/api/v1/admin/dashboard/trends', {
        days: String(days), userId: String(userId),
      })
      setTrends(data.series)
    } catch (err: any) {
      setError(err.message || '获取趋势数据失败')
      setTrends(null)
    } finally { setLoadingTrend(false) }
  }, [])

  // ── 事件处理 ──
  const handleSelect = (user: EnterpriseUser) => {
    setSelected(user)
    setShowSuggestions(false)
    setQuery(user.companyName || user.email)
    setActiveTab('analysis')
    setOverview(null)
    setTopConsumers([])
    setEnterpriseTrend(null)
    setFinance(null)
    setActivity(null)
    fetchTrend(user.id, daysRange)
    loadModelBreakdown(user.id, daysRange)
    loadFinance(user.id, daysRange)
    loadActivity(user.id, daysRange)
  }

  const handleClear = () => {
    setSelected(null)
    setQuery('')
    setTrends(null)
    setModelBreakdown([])
    setFinance(null)
    setActivity(null)
    setSuggestions([])
  }

  const handleDaysChange = (days: number) => {
    setDaysRange(days)
    if (selected) {
      fetchTrend(selected.id, days)
      loadModelBreakdown(selected.id, days)
      loadFinance(selected.id, days)
      loadActivity(selected.id, days)
    } else {
      loadEnterpriseTrend()
    }
  }

  const handleRefresh = () => {
    if (!selected) return
    fetchTrend(selected.id, daysRange)
    loadModelBreakdown(selected.id, daysRange)
    loadFinance(selected.id, daysRange)
    loadActivity(selected.id, daysRange)
  }

  const handleExportCSV = () => {
    if (!trends || trends.length === 0) return
    const headers = ['日期', '调用量', '成功', '失败', '超时', '成功率(%)', 'Token', '消费(¥)', '平均耗时(ms)']
    const rows = trends.map(d => [d.date, d.calls.total, d.calls.success, d.calls.failed, d.calls.timeout, d.calls.successRate, d.calls.totalTokens, d.calls.totalCost, d.calls.avgDuration])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `企业数据分析_${selected?.companyName || '全局'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 计算值 ──
  const chartData = (trends ?? []).map(d => ({
    date: d.date.slice(5), calls: d.calls.total,
    tokens: Math.round(d.calls.totalTokens / 10000),
    cost: parseFloat(d.calls.totalCost), successRate: d.calls.successRate, newUsers: d.newUsers,
  }))

  const summary = {
    totalCalls: trends?.reduce((s, d) => s + d.calls.total, 0) ?? 0,
    totalTokens: trends?.reduce((s, d) => s + d.calls.totalTokens, 0) ?? 0,
    totalCost: trends?.reduce((s, d) => s + parseFloat(d.calls.totalCost), 0) ?? 0,
    avgSuccessRate: trends && trends.length > 0
      ? trends.reduce((s, d) => s + d.calls.successRate, 0) / trends.length : 100,
    avgDailyCost: trends && trends.length > 0
      ? trends.reduce((s, d) => s + parseFloat(d.calls.totalCost), 0) / trends.length : 0,
  }

  const getMomChange = () => {
    if (!trends || trends.length < 14) return null
    const half = Math.floor(trends.length / 2)
    const recent = trends.slice(-half).reduce((s, d) => s + d.calls.total, 0)
    const prev = trends.slice(0, half).reduce((s, d) => s + d.calls.total, 0)
    if (prev === 0) return null
    return ((recent - prev) / prev * 100).toFixed(1)
  }

  const statusPieData = (trends && trends.length > 0)
    ? [
      { name: '成功', value: trends.reduce((s, d) => s + d.calls.success, 0), color: '#00b894' },
      { name: '失败', value: trends.reduce((s, d) => s + d.calls.failed, 0), color: '#e17055' },
      { name: '超时', value: trends.reduce((s, d) => s + d.calls.timeout, 0), color: '#fdcb6e' },
    ].filter(d => d.value > 0)
    : []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">企业数据分析</h1>
        <FeatureDescription page="admin/enterprise-analysis" className="ml-2" />
        <p className="text-sm text-slate-500 mt-1">
          {selected
            ? `查看「${selected.companyName || selected.email}」的详细分析数据`
            : '搜索企业查看详细分析，或浏览全局企业数据概览'}
        </p>
      </div>

      <EnterpriseSearch
        query={query}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        searching={searching}
        statusFilter={statusFilter}
        showStatusMenu={showStatusMenu}
        onQueryChange={setQuery}
        onSelect={handleSelect}
        onClear={handleClear}
        onStatusFilterChange={(v) => { setStatusFilter(v); setShowStatusMenu(false) }}
        onToggleStatusMenu={() => setShowStatusMenu(!showStatusMenu)}
        onCloseStatusMenu={() => { setShowSuggestions(false); setShowStatusMenu(false) }}
        onShowSuggestions={(val) => setShowSuggestions(val)}
      />

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {selected ? (
        <DetailPanel
          selected={selected}
          trends={trends}
          loadingTrend={loadingTrend}
          trendDimension={trendDimension}
          daysRange={daysRange}
          chartData={chartData}
          summary={summary}
          momChange={getMomChange()}
          modelBreakdown={modelBreakdown}
          loadingModels={loadingModels}
          finance={finance}
          loadingFinance={loadingFinance}
          activity={activity}
          loadingActivity={loadingActivity}
          activeTab={activeTab}
          statusPieData={statusPieData}
          onDimensionChange={setTrendDimension}
          onDaysChange={handleDaysChange}
          onTabChange={setActiveTab}
          onExportCSV={handleExportCSV}
          onRefresh={handleRefresh}
          onClear={handleClear}
        />
      ) : (
        <AnalysisOverview
          overview={overview}
          topConsumers={topConsumers}
          enterpriseTrend={enterpriseTrend}
          daysRange={daysRange}
          onSelect={handleSelect}
          onDaysChange={handleDaysChange}
        />
      )}
    </div>
  )
}
