import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '@/lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  Loader2, AlertCircle, Search, X, Building2, Mail, Wallet,
  TrendingUp, Activity, RefreshCw, Download, ChevronDown,
  TrendingDown, DollarSign, Zap, BarChart3, Clock,
} from 'lucide-react'
import type {
  EnterpriseUser, DaySeries, EnterpriseOverview, TopConsumer,
  ModelBreakdown, FinanceData, ActivityData,
} from './types'
import { fmt, fmtCompact, fmtPercent, DIMENSIONS, DATE_RANGES, STATUS_OPTIONS, CHART_TOOLTIP_STYLE } from './types'
import { StatusBadge, StatCard } from './shared'
import EnterpriseOverviewPanel from './EnterpriseOverview'
import ConsumptionTrend from './ConsumptionTrend'
import TokenDistribution from './TokenDistribution'
import FinanceTab from './FinanceTab'
import ActivityTab from './ActivityTab'
import FeatureDescription from '@/components/admin/FeatureDescription'

/* ═══════════════════════════════════════════════════════════════════
   EnterpriseAnalysis Page
   ═══════════════════════════════════════════════════════════════════ */
export default function EnterpriseAnalysis() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<EnterpriseUser[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<EnterpriseUser | null>(null)
  const [trends, setTrends] = useState<DaySeries[] | null>(null)
  const [loadingTrend, setLoadingTrend] = useState(false)
  const [error, setError] = useState('')
  const [trendDimension, setTrendDimension] = useState<string>('calls')
  const [daysRange, setDaysRange] = useState<number>(30)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('analysis')
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdown[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [finance, setFinance] = useState<FinanceData | null>(null)
  const [loadingFinance, setLoadingFinance] = useState(false)
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [overview, setOverview] = useState<EnterpriseOverview | null>(null)
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([])
  const [enterpriseTrend, setEnterpriseTrend] = useState<DaySeries[] | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── 加载全局看板数据 ──
  useEffect(() => {
    if (selected) return
    loadOverview()
    loadTopConsumers()
    loadEnterpriseTrend()
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
        userId: String(userId),
        days: String(days),
      })
      setModelBreakdown(data)
    } catch { setModelBreakdown([]) } finally { setLoadingModels(false) }
  }, [])

  const loadFinance = useCallback(async (userId: number, days: number) => {
    setLoadingFinance(true)
    try {
      const data = await get<FinanceData>('/api/v1/admin/dashboard/enterprise-finance', {
        userId: String(userId),
        days: String(days),
      })
      setFinance(data)
    } catch { setFinance(null) } finally { setLoadingFinance(false) }
  }, [])

  const loadActivity = useCallback(async (userId: number, days: number) => {
    setLoadingActivity(true)
    try {
      const data = await get<ActivityData>('/api/v1/admin/dashboard/enterprise-activity', {
        userId: String(userId),
        days: String(days),
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

  // ── 点击外面关闭下拉 ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── 选中企业 → 拉趋势 + 模型分解 ──
  const fetchTrend = useCallback(async (userId: number, days: number) => {
    setLoadingTrend(true)
    setError('')
    try {
      const data = await get<{ series: DaySeries[] }>('/api/v1/admin/dashboard/trends', { days: String(days), userId: String(userId) })
      setTrends(data.series)
    } catch (err: any) {
      setError(err.message || '获取趋势数据失败')
      setTrends(null)
    } finally { setLoadingTrend(false) }
  }, [])

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
    setSuggestions([])
  }

  const handleDimensionChange = (key: string) => {
    setTrendDimension(key)
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

  // ── 趋势图数据 ──
  const chartData = (trends ?? []).map((d) => ({
    date: d.date.slice(5),
    calls: d.calls.total,
    tokens: Math.round(d.calls.totalTokens / 10000),
    cost: parseFloat(d.calls.totalCost),
    successRate: d.calls.successRate,
    newUsers: d.newUsers,
  }))

  const getChartLines = () => {
    switch (trendDimension) {
      case 'calls': return [{ key: 'calls', label: '调用量', color: '#0984e3', yAxisId: 'left' as const }]
      case 'tokens': return [{ key: 'tokens', label: 'Token(万)', color: '#6c5ce7', yAxisId: 'left' as const }]
      case 'cost': return [{ key: 'cost', label: '消费金额(￥)', color: '#00b894', yAxisId: 'left' as const }]
      case 'successRate': return [{ key: 'successRate', label: '成功率(%)', color: '#fdcb6e', yAxisId: 'left' as const }]
      default: return [{ key: 'calls', label: '调用量', color: '#0984e3', yAxisId: 'left' as const }]
    }
  }

  // ── 导出 CSV ──
  const handleExportCSV = () => {
    if (!trends || trends.length === 0) return
    const headers = ['日期', '调用量', '成功', '失败', '超时', '成功率(%)', 'Token', '消费(￥)', '平均耗时(ms)']
    const rows = trends.map(d => [
      d.date,
      d.calls.total,
      d.calls.success,
      d.calls.failed,
      d.calls.timeout,
      d.calls.successRate,
      d.calls.totalTokens,
      d.calls.totalCost,
      d.calls.avgDuration,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `企业数据分析_${selected?.companyName || '全局'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 计算汇总 ──
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
  const momChange = getMomChange()

  // ── UI 组件 ──
  const dimensionButtons = (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {DIMENSIONS.map(dim => (
        <button key={dim.key} onClick={() => handleDimensionChange(dim.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            trendDimension === dim.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {dim.label}
        </button>
      ))}
    </div>
  )

  const dateRangeButtons = (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {DATE_RANGES.map(r => (
        <button key={r.value} onClick={() => handleDaysChange(r.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            daysRange === r.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════
     Tabs
     ═══════════════════════════════════════════════════════════════════ */
  const TABS = [
    { key: 'analysis', label: '调用分析', icon: Activity },
    { key: 'models', label: '模型分布', icon: BarChart3 },
    { key: 'finance', label: '财务流水', icon: DollarSign },
    { key: 'activity', label: '活跃记录', icon: Activity },
  ] as const

  function TabBar() {
    return (
      <div className="flex border-b border-slate-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'text-blue-600 border-blue-500'
                  : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
              }`}>
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     Enterprise Detail Panel (with Tabs)
     ═══════════════════════════════════════════════════════════════════ */
  function EnterpriseDetailPanel() {
    const lines = getChartLines()

    return (
      <div className="space-y-4">
        {/* 企业信息卡片 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 size={22} className="text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-900">{selected!.companyName || '未设置公司名'}</h2>
                  {selected!.status && <StatusBadge status={selected!.status} />}
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Mail size={13} /> {selected!.email}</span>
                  <span className="flex items-center gap-1"><Wallet size={13} /> 余额 <strong className="text-emerald-600">￥{fmt(selected!.balance)}</strong></span>
                  {selected!.lastLoginAt && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={12} />
                      最近活跃: {new Date(selected!.lastLoginAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} disabled={!trends || trends.length === 0}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
                <Download size={13} /> 导出 CSV
              </button>
              <button onClick={() => {
                fetchTrend(selected!.id, daysRange)
                loadModelBreakdown(selected!.id, daysRange)
                loadFinance(selected!.id, daysRange)
                loadActivity(selected!.id, daysRange)
              }} disabled={loadingTrend}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                <RefreshCw size={13} className={loadingTrend ? 'animate-spin' : ''} /> 刷新
              </button>
              <button onClick={handleClear}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition">更换企业</button>
            </div>
          </div>
        </div>

        {/* 趋势图 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-800">{`${selected!.companyName || selected!.email} 调用趋势`}</h3>
              </div>
              <div className="flex items-center gap-2">{dimensionButtons}{dateRangeButtons}</div>
            </div>
          </div>
          <div className="p-5">
            {!trends ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-sm text-slate-400"><Loader2 className="animate-spin mb-2" size={24} />加载趋势数据...</div>
            ) : trends.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">该企业暂无调用数据</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#bbb" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#bbb" />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend />
                    {lines.map(l => (
                      <Line key={l.key} yAxisId={l.yAxisId} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={2.5} dot={false} name={l.label} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                  {lines.map(l => (<span key={l.key}><span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ backgroundColor: l.color }} />{l.label}</span>))}
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-400">近{daysRange} 天 · {trends.length} 天数据</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 6 统计卡片 */}
        {trends && trends.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard icon={<BarChart3 size={14} />} label={`${daysRange} 天总调用`} value={fmtCompact(summary.totalCalls)} color="text-blue-600" />
            <StatCard icon={<Zap size={14} />} label={`${daysRange} 天 Token`} value={`${(summary.totalTokens / 10000).toFixed(1)}万`} color="text-purple-600" />
            <StatCard icon={<DollarSign size={14} />} label={`${daysRange} 天总消费`} value={`￥${fmt(summary.totalCost)}`} color="text-emerald-600" />
            <StatCard icon={<Activity size={14} />} label="平均成功率" value={fmtPercent(summary.avgSuccessRate)} color="text-amber-600" />
            <StatCard icon={<TrendingUp size={14} />} label="日均消费" value={`￥${fmt(summary.avgDailyCost)}`} color="text-sky-600" />
            <StatCard
              icon={momChange && parseFloat(momChange) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              label="环比变化" value={momChange !== null ? `${parseFloat(momChange) >= 0 ? '+' : ''}${momChange}%` : '--'}
              sub="后半周期 vs 前半周期"
              color={momChange !== null && parseFloat(momChange) >= 0 ? 'text-emerald-600' : 'text-red-500'}
            />
          </div>
        )}

        {/* Tab 切换 */}
        <TabBar />

        {/* Tab 内容 */}
        {activeTab === 'analysis' && <ConsumptionTrend trends={trends} modelBreakdown={modelBreakdown} loadingModels={loadingModels} onExportCSV={handleExportCSV} />}
        {activeTab === 'models' && <TokenDistribution modelBreakdown={modelBreakdown} loadingModels={loadingModels} />}
        {activeTab === 'finance' && <FinanceTab finance={finance} loadingFinance={loadingFinance} daysRange={daysRange} />}
        {activeTab === 'activity' && <ActivityTab activity={activity} loadingActivity={loadingActivity} daysRange={daysRange} modelBreakdown={modelBreakdown} />}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     Main Render
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">企业数据分析</h1>
        <FeatureDescription page="admin/enterprise-analysis" className="ml-2" />
        <p className="text-sm text-slate-500 mt-1">
          {selected ? `查看『${selected.companyName || selected.email}』的详细分析数据` : '搜索企业查看详细分析，或浏览全局企业数据概览'}
        </p>
      </div>

      {/* 搜索框 + 状态筛选 */}
      <div className="flex items-start gap-3">
        <div ref={wrapperRef} className="relative flex-1 max-w-xl">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
              placeholder="搜索企业名称或邮箱..."
              className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            {query && <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={16} /></button>}
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              {suggestions.map((u) => (
                <button key={u.id} onClick={() => handleSelect(u)}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5"><Building2 size={14} className="text-blue-500" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{u.companyName || u.nickname || u.email}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{u.email}</div>
                    <div className="mt-1">{u.status && <StatusBadge status={u.status} />}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-semibold text-emerald-600">￥{fmt(u.balance)}</div>
                    <div className="text-[10px] text-slate-400">余额</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {showSuggestions && query && !searching && suggestions.length === 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 p-4 text-center text-sm text-slate-400">未找到匹配的企业</div>
          )}
          {searching && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 p-4 text-center text-sm text-slate-400"><Loader2 className="inline animate-spin mr-2" size={14} />搜索中...</div>
          )}
        </div>

        <div ref={statusRef} className="relative">
          <button onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition text-slate-600">
            {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || '状态'} <ChevronDown size={14} />
          </button>
          {showStatusMenu && (
            <div className="absolute right-0 z-20 mt-1 w-28 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setShowStatusMenu(false) }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-slate-50 transition ${statusFilter === opt.value ? 'text-blue-600 bg-blue-50 font-medium' : 'text-slate-600'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {selected ? <EnterpriseDetailPanel /> : (
        <EnterpriseOverviewPanel
          overview={overview}
          topConsumers={topConsumers}
          enterpriseTrend={enterpriseTrend}
          dateRangeButtons={dateRangeButtons}
          onSelectEnterprise={handleSelect}
        />
      )}
    </div>
  )
}