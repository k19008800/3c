import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '@/lib/api'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'
import {
  Loader2, AlertCircle, Search, X, Building2, Mail, Wallet,
  TrendingUp, Activity, RefreshCw, Download, ChevronDown,
  DollarSign, Zap, BarChart3, TrendingDown, Clock, PieChart as PieIcon,
  Landmark, MapPin,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

/* ── Types ── */
interface EnterpriseUser {
  id: number
  email: string
  nickname: string | null
  companyName: string | null
  balance: string
  lastLoginAt: string | null
  status: string | null
}

interface DaySeries {
  date: string
  calls: { total: number; success: number; failed: number; timeout: number; successRate: number; totalTokens: number; totalCost: string; avgDuration: number }
  newUsers: number
  revenue: { count: number; total: string }
}

interface LowBalanceEnterprise {
  id: number
  email: string
  nickname: string | null
  companyName: string | null
  balance: string
  lastLoginAt: string | null
}

interface EnterpriseOverview {
  totalEnterprises: number
  totalBalance: string
  monthNewEnterprises: number
  activeEnterprises: number
  monthConsumption: { totalCalls: number; totalCost: string; totalTokens: number }
  monthRecharge: { count: number; total: string }
  yesterdayConsumption: string
  lowBalanceEnterpriseCount: number
  lowBalanceEnterpriseList: LowBalanceEnterprise[]
}

interface TopConsumer {
  userId: number
  email: string
  nickname: string | null
  userType: string
  companyName: string | null
  totalConsumption: string
  totalCalls: number
  monthConsumption: string
  balance: string
}

interface ModelBreakdown {
  modelName: string
  displayName: string
  type: string
  totalCalls: number
  successCalls: number
  successRate: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: string
  avgDuration: number
}

interface BalanceTrendPoint {
  day: string
  balance: string
}

interface FinanceEvent {
  id: number
  time: string
  type: string
  amount: string
  balanceAfter: string
  description: string | null
}

interface RechargeEvent {
  id: number
  amount: string
  channel: string
  status: string
  time: string
}

interface FinanceSummary {
  totalRecharge: string
  rechargeCount: number
  totalConsumption: string
  callCount: number
}

interface FinanceData {
  balanceTrend: BalanceTrendPoint[]
  events: FinanceEvent[]
  rechargeEvents: RechargeEvent[]
  summary: FinanceSummary
}

interface ActivityPoint {
  day: string
  count: number
}

interface HourlyPoint {
  hour: number
  count: number
}

interface IPPoint {
  ip: string
  count: number
}

interface ModelRankItem {
  modelName: string | null
  count: number
  totalTokens: number
}

interface ActivityData {
  dailyActivity: ActivityPoint[]
  hourlyDistribution: HourlyPoint[]
  ipDistribution: IPPoint[]
  modelRanking: ModelRankItem[]
}

/* ── Constants ── */
const DIMENSIONS = [
  { key: 'calls', label: '调用量', color: '#0984e3' },
  { key: 'tokens', label: 'Token 消耗', color: '#6c5ce7' },
  { key: 'cost', label: '消费金额', color: '#00b894' },
  { key: 'successRate', label: '成功率', color: '#fdcb6e' },
] as const

const DATE_RANGES = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
] as const

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: '', label: '全部', color: '' },
  { value: 'active', label: '正常', color: 'text-emerald-600 bg-emerald-50' },
  { value: 'disabled', label: '停用', color: 'text-red-600 bg-red-50' },
  { value: 'pending', label: '待审', color: 'text-amber-600 bg-amber-50' },
]

const PIE_COLORS = ['#0984e3', '#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#00cec9', '#636e72', '#a29bfe', '#fd79a8', '#55efc4']

const TABS = [
  { key: 'analysis', label: '调用分析', icon: Activity },
  { key: 'models', label: '模型分布', icon: PieIcon },
  { key: 'finance', label: '财务流水', icon: Landmark },
  { key: 'activity', label: '活跃记录', icon: MapPin },
] as const

/* ── Helpers ── */
function fmt(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCompact(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString('zh-CN')
}

function fmtPercent(v: number): string {
  return v.toFixed(1) + '%'
}

const CHART_TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status)
  if (!opt) return null
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${opt.color}`}>
      {opt.label}
    </span>
  )
}

/* ── Stat Card ── */
function StatCard({ icon, label, value, sub, color, disabled }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string; disabled?: boolean }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={color || 'text-slate-400'}>{icon}</span>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color || 'text-slate-800'} mt-0.5`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

/* ════════════════════════════════════════
   EnterpriseAnalysis Page
   ════════════════════════════════════════ */
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

  // Finance state
  const [finance, setFinance] = useState<FinanceData | null>(null)
  const [loadingFinance, setLoadingFinance] = useState(false)

  // Activity state
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Overview state (empty state)
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

  // ── 加载模型分解 ──
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

  // ── 加载财务流水 ──
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

  // ── 加载活跃记录 ──
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

  // ── 点外面关闭下拉 ──
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

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
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
      case 'calls': return [{ key: 'calls', label: '调用量', color: '#0984e3', yAxisId: 'left' }]
      case 'tokens': return [{ key: 'tokens', label: 'Token(万)', color: '#6c5ce7', yAxisId: 'left' }]
      case 'cost': return [{ key: 'cost', label: '消费金额(¥)', color: '#00b894', yAxisId: 'left' }]
      case 'successRate': return [{ key: 'successRate', label: '成功率(%)', color: '#fdcb6e', yAxisId: 'left' }]
      default: return [{ key: 'calls', label: '调用量', color: '#0984e3', yAxisId: 'left' }]
    }
  }

  // ── 导出 CSV ──
  const handleExportCSV = () => {
    if (!trends || trends.length === 0) return
    const headers = ['日期', '调用量', '成功', '失败', '超时', '成功率(%)', 'Token', '消费(¥)', '平均耗时(ms)']
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

  // ── 状态分布（从 trends 聚合） ──
  const statusPieData = (trends && trends.length > 0)
    ? [
      { name: '成功', value: trends.reduce((s, d) => s + d.calls.success, 0), color: '#00b894' },
      { name: '失败', value: trends.reduce((s, d) => s + d.calls.failed, 0), color: '#e17055' },
      { name: '超时', value: trends.reduce((s, d) => s + d.calls.timeout, 0), color: '#fdcb6e' },
    ].filter(d => d.value > 0)
    : []

  // ── UI 片段 ──
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

  /* ════════════════════════════════════════
     全局企业看板
     ════════════════════════════════════════ */
  function EnterpriseOverviewPanel() {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Building2 size={15} />} label="企业总数" value={overview ? String(overview.totalEnterprises) : '—'} sub={overview ? `本月新增 ${overview.monthNewEnterprises} 家` : ''} color="text-blue-600" />
          <StatCard icon={<Wallet size={15} />} label="企业总余额" value={overview ? `¥${fmt(overview.totalBalance)}` : '—'} color="text-emerald-600" />
          <StatCard icon={<Activity size={15} />} label="月活跃企业" value={overview ? String(overview.activeEnterprises) : '—'} sub={overview && overview.totalEnterprises > 0 ? `活跃率 ${(overview.activeEnterprises / overview.totalEnterprises * 100).toFixed(1)}%` : ''} color="text-violet-600" />
          <StatCard icon={<AlertCircle size={15} />} label="低余额企业" value={overview ? String(overview.lowBalanceEnterpriseCount) : '—'} sub={overview && overview.lowBalanceEnterpriseCount > 0 ? '余额 < ¥10' : ''} color="text-amber-600" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<TrendingUp size={15} />} label="本月企业总消费" value={overview ? `¥${fmt(overview.monthConsumption.totalCost)}` : '—'} sub={overview ? `${fmtCompact(overview.monthConsumption.totalCalls)} 次调用` : ''} color="text-orange-600" />
          <StatCard icon={<Zap size={15} />} label="本月企业 Token" value={overview ? `${fmtCompact(overview.monthConsumption.totalTokens)}` : '—'} color="text-purple-600" />
          <StatCard icon={<DollarSign size={15} />} label="本月企业充值" value={overview ? `¥${fmt(overview.monthRecharge.total)}` : '—'} sub={overview ? `${overview.monthRecharge.count} 笔` : ''} color="text-emerald-600" />
          <StatCard icon={<TrendingDown size={15} />} label="昨日消费" value={overview ? `¥${fmt(overview.yesterdayConsumption)}` : '—'} color="text-sky-600" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2"><BarChart3 size={16} className="text-slate-600" /><h3 className="text-sm font-semibold text-slate-800">企业整体趋势</h3></div>
            {dateRangeButtons}
          </div>
          <div className="p-5">
            {!enterpriseTrend ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-400"><Loader2 className="animate-spin mr-2" size={16} />加载中...</div>
            ) : enterpriseTrend.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">暂无数据</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={enterpriseTrend.map(d => ({ date: d.date.slice(5), calls: d.calls.total, tokens: Math.round(d.calls.totalTokens / 10000), cost: parseFloat(d.calls.totalCost) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#bbb" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#bbb" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#bbb" />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="calls" stroke="#0984e3" strokeWidth={2.5} dot={false} name="企业调用量" />
                    <Line yAxisId="right" type="monotone" dataKey="tokens" stroke="#6c5ce7" strokeWidth={2.5} strokeDasharray="5 3" dot={false} name="Token(万)" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 text-xs text-slate-500 mt-2">
                  <span><span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1" /> 企业调用量</span>
                  <span><span className="inline-block w-3 h-0.5 bg-violet-500 align-middle mr-1" style={{ borderTop: '2px dashed #6c5ce7', height: 0 }} /> Token 消耗</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2"><BarChart3 size={16} className="text-slate-600" /><h3 className="text-sm font-semibold text-slate-800">企业消费排行 Top 10</h3></div>
          </div>
          <div className="overflow-x-auto">
            {topConsumers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">暂无数据</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="text-left px-4 py-3 font-medium w-10">#</th>
                    <th className="text-left px-4 py-3 font-medium">企业名称</th>
                    <th className="text-right px-4 py-3 font-medium">本月消费</th>
                    <th className="text-right px-4 py-3 font-medium">累计消费</th>
                    <th className="text-right px-4 py-3 font-medium">调用量</th>
                    <th className="text-right px-4 py-3 font-medium">余额</th>
                    <th className="text-center px-4 py-3 font-medium">类型</th>
                  </tr>
                </thead>
                <tbody>
                  {topConsumers.map((c, i) => (
                    <tr key={c.userId} className="border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer"
                      onClick={() => handleSelect({ id: c.userId, email: c.email, nickname: c.nickname, companyName: c.companyName, balance: c.balance, lastLoginAt: null, status: null })}>
                      <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{c.companyName || c.nickname || c.email}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">¥{fmt(c.monthConsumption)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">¥{fmt(c.totalConsumption)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmtCompact(c.totalCalls)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">¥{fmt(c.balance)}</td>
                      <td className="px-4 py-3 text-center"><span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">企业</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 低余额企业预警 */}
        {overview && overview.lowBalanceEnterpriseList && overview.lowBalanceEnterpriseList.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-amber-800">低余额企业预警</h3>
              <span className="text-xs text-amber-600 ml-auto">{overview.lowBalanceEnterpriseCount} 家余额 &lt; ¥10</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-100 text-xs text-amber-600">
                    <th className="text-left px-4 py-3 font-medium">企业名称</th>
                    <th className="text-left px-4 py-3 font-medium">邮箱</th>
                    <th className="text-right px-4 py-3 font-medium">余额</th>
                    <th className="text-right px-4 py-3 font-medium">最近活跃</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.lowBalanceEnterpriseList.map(u => (
                    <tr key={u.id} className="border-b border-amber-50 hover:bg-amber-50/50 transition cursor-pointer"
                      onClick={() => handleSelect({ id: u.id, email: u.email, nickname: u.nickname, companyName: u.companyName, balance: u.balance, lastLoginAt: u.lastLoginAt, status: 'active' })}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{u.companyName || u.nickname || u.email}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-500">{u.email}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm font-semibold text-red-500">¥{fmt(u.balance)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-center py-6">
          <div className="inline-flex items-center gap-2 text-sm text-slate-400 bg-slate-50 px-4 py-2 rounded-full"><Search size={14} />在上方搜索框输入企业名称或邮箱，查看详细分析</div>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════
     Tab 1: 调用分析
     ════════════════════════════════════════ */
  function AnalysisTab() {
    const topModels = modelBreakdown.slice(0, 10)
    return (
      <div className="space-y-4">

        {/* 状态分布饼图 + 调用量 Top 模型柱状图 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 调用状态分布 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <PieIcon size={14} /> 调用状态分布
              </h3>
            </div>
            <div className="p-4 flex items-center justify-center h-[260px]">
              {!trends ? (
                <Loader2 className="animate-spin text-slate-400" size={24} />
              ) : statusPieData.length === 0 ? (
                <span className="text-sm text-slate-400">暂无数据</span>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: any) => Number(value).toLocaleString()} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top 10 模型调用量 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <BarChart3 size={14} /> Top 10 模型调用量
              </h3>
            </div>
            <div className="p-4 flex items-center justify-center h-[260px]">
              {loadingModels ? (
                <Loader2 className="animate-spin text-slate-400" size={24} />
              ) : topModels.length === 0 ? (
                <span className="text-sm text-slate-400">暂无数据</span>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topModels} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#bbb" />
                    <YAxis type="category" dataKey="displayName" tick={{ fontSize: 11 }} stroke="#bbb" width={140} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: any) => Number(value).toLocaleString()} />
                    <Bar dataKey="totalCalls" fill="#0984e3" radius={[0, 4, 4, 0]} name="调用量" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* 每日调用明细表 */}
        {trends && trends.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">每日调用明细</h3>
              <div className="flex items-center gap-2">
                <button onClick={handleExportCSV} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100"><Download size={12} /> 导出 CSV</button>
                <span className="text-xs text-slate-400">{trends.length} 天</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="text-left px-4 py-3 font-medium">日期</th>
                    <th className="text-right px-4 py-3 font-medium">调用量</th>
                    <th className="text-right px-4 py-3 font-medium">成功</th>
                    <th className="text-right px-4 py-3 font-medium">失败</th>
                    <th className="text-right px-4 py-3 font-medium">成功率</th>
                    <th className="text-right px-4 py-3 font-medium">Token</th>
                    <th className="text-right px-4 py-3 font-medium">费用</th>
                    <th className="text-right px-4 py-3 font-medium">平均耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trends].reverse().map(d => (
                    <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5 text-slate-600">{d.date}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-800">{d.calls.total}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600">{d.calls.success}</td>
                      <td className="px-4 py-2.5 text-right text-red-500">{d.calls.failed}</td>
                      <td className="px-4 py-2.5 text-right">{d.calls.successRate}%</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{(d.calls.totalTokens / 10000).toFixed(1)}万</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">¥{fmt(d.calls.totalCost)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{d.calls.avgDuration}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════
     Tab 2: 模型分布
     ════════════════════════════════════════ */
  function ModelsTab() {
    // 模型类型分布
    const typeGroups = modelBreakdown.reduce<Record<string, { count: number; calls: number; tokens: number; cost: number }>>((acc, m) => {
      const t = m.type || 'other'
      if (!acc[t]) acc[t] = { count: 0, calls: 0, tokens: 0, cost: 0 }
      acc[t].count++
      acc[t].calls += m.totalCalls
      acc[t].tokens += m.totalTokens
      acc[t].cost += parseFloat(m.totalCost)
      return acc
    }, {})
    const typePieData = Object.entries(typeGroups).map(([name, v]) => ({
      name: name === 'chat' ? '对话' : name === 'image' ? '图片' : name === 'audio' ? '音频' : name === 'embedding' ? '嵌入' : name,
      value: v.tokens,
      color: PIE_COLORS[Object.keys(typeGroups).indexOf(name) % PIE_COLORS.length],
    }))

    // Token 占比饼图（Top 8 模型）
    const sortedByTokens = [...modelBreakdown].sort((a, b) => b.totalTokens - a.totalTokens)
    const topTokenModels = sortedByTokens.slice(0, 8).map(m => ({
      name: m.displayName || m.modelName || 'unknown',
      value: m.totalTokens,
      color: PIE_COLORS[sortedByTokens.indexOf(m) % PIE_COLORS.length],
    }))

    // 消费柱状图（Top 10）
    const topCostModels = [...modelBreakdown].sort((a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost)).slice(0, 10)

    return (
      <div className="space-y-4">

        {/* Token 饼图 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <PieIcon size={14} /> Token 分布（Top 8）
              </h3>
            </div>
            <div className="p-4 flex items-center justify-center h-[280px]">
              {loadingModels ? (
                <Loader2 className="animate-spin text-slate-400" size={24} />
              ) : topTokenModels.length === 0 ? (
                <span className="text-sm text-slate-400">暂无数据</span>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={topTokenModels} cx="50%" cy="50%" innerRadius={50} outerRadius={95} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} paddingAngle={1}>
                      {topTokenModels.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `${((v as number) / 10000).toFixed(1)}万`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 消费柱状图 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <DollarSign size={14} /> 模型消费排行（Top 10）
              </h3>
            </div>
            <div className="p-4 flex items-center justify-center h-[280px]">
              {loadingModels ? (
                <Loader2 className="animate-spin text-slate-400" size={24} />
              ) : topCostModels.length === 0 ? (
                <span className="text-sm text-slate-400">暂无数据</span>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topCostModels} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#bbb" tickFormatter={(v: number) => `¥${v}`} />
                    <YAxis type="category" dataKey="displayName" tick={{ fontSize: 11 }} stroke="#bbb" width={140} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: any) => `¥${Number(value).toFixed(2)}`} />
                    <Bar dataKey="totalCost" fill="#00b894" radius={[0, 4, 4, 0]} name="消费" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* 模型类型分布饼图 */}
        {typePieData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <PieIcon size={14} /> 模型类型分布（按 Token）
                </h3>
              </div>
              <div className="p-4 flex items-center justify-center h-[240px]">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {typePieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `${((v as number) / 10000).toFixed(1)}万`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 模型总数统计 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <BarChart3 size={14} /> 模型使用概览
                </h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-800">{modelBreakdown.length}</div>
                    <div className="text-xs text-slate-400 mt-1">使用模型数</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-800">{modelBreakdown.reduce((s, m) => s + m.totalCalls, 0).toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">总调用量</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-emerald-600">{(modelBreakdown.reduce((s, m) => s + m.totalTokens, 0) / 10000).toFixed(1)}万</div>
                    <div className="text-xs text-slate-400 mt-1">总 Token</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-emerald-600">¥{fmt(modelBreakdown.reduce((s, m) => s + parseFloat(m.totalCost), 0))}</div>
                    <div className="text-xs text-slate-400 mt-1">总消费</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 模型详情表 */}
        {modelBreakdown.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">模型详情</h3>
              <span className="text-xs text-slate-400">{modelBreakdown.length} 个模型</span>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="text-left px-4 py-3 font-medium">模型名称</th>
                    <th className="text-center px-4 py-3 font-medium">类型</th>
                    <th className="text-right px-4 py-3 font-medium">调用量</th>
                    <th className="text-right px-4 py-3 font-medium">成功率</th>
                    <th className="text-right px-4 py-3 font-medium">Prompt Token</th>
                    <th className="text-right px-4 py-3 font-medium">Completion Token</th>
                    <th className="text-right px-4 py-3 font-medium">总 Token</th>
                    <th className="text-right px-4 py-3 font-medium">消费</th>
                    <th className="text-right px-4 py-3 font-medium">平均耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {[...modelBreakdown].sort((a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost)).map((m, i) => (
                    <tr key={m.modelName || i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-800">{m.displayName || m.modelName}</span>
                        {m.modelName && m.displayName && m.displayName !== m.modelName && (
                          <span className="text-[10px] text-slate-400 ml-1">({m.modelName})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          m.type === 'chat' ? 'bg-blue-50 text-blue-600' :
                          m.type === 'image' ? 'bg-purple-50 text-purple-600' :
                          m.type === 'audio' ? 'bg-amber-50 text-amber-600' :
                          m.type === 'embedding' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {m.type === 'chat' ? '对话' : m.type === 'image' ? '图片' : m.type === 'audio' ? '音频' : m.type === 'embedding' ? '嵌入' : m.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-800">{m.totalCalls.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">{m.successRate}%</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{(m.promptTokens / 10000).toFixed(1)}万</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{(m.completionTokens / 10000).toFixed(1)}万</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 font-medium">{(m.totalTokens / 10000).toFixed(1)}万</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">¥{fmt(m.totalCost)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{m.avgDuration}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════
     Tab 3: 财务流水
     ════════════════════════════════════════ */
  function FinanceTab() {
    const balanceChartData = (finance?.balanceTrend ?? []).map(d => ({
      day: d.day.slice(5),
      balance: parseFloat(d.balance),
    }))

    return (
      <div className="space-y-4">
        {loadingFinance ? (
          <div className="h-[200px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
        ) : !finance ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">暂无财务数据</div>
        ) : (
          <>
            {/* 汇总卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<DollarSign size={14} />} label={`${daysRange} 天充值总额`} value={`¥${fmt(finance.summary.totalRecharge)}`} sub={`${finance.summary.rechargeCount} 笔`} color="text-emerald-600" />
              <StatCard icon={<TrendingDown size={14} />} label={`${daysRange} 天消费总额`} value={`¥${fmt(finance.summary.totalConsumption)}`} sub={`${finance.summary.callCount.toLocaleString()} 次调用`} color="text-red-500" />
              <StatCard icon={<Wallet size={14} />} label="净充值" value={`¥${fmt((parseFloat(finance.summary.totalRecharge) - parseFloat(finance.summary.totalConsumption)).toFixed(2))}`} color={parseFloat(finance.summary.totalRecharge) >= parseFloat(finance.summary.totalConsumption) ? 'text-blue-600' : 'text-amber-600'} />
              <StatCard icon={<BarChart3 size={14} />} label="充值/消费比" value={parseFloat(finance.summary.totalConsumption) > 0 ? ((parseFloat(finance.summary.totalRecharge) / parseFloat(finance.summary.totalConsumption))).toFixed(2) : '—'} color="text-purple-600" />
            </div>

            {/* 余额趋势 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><TrendingUp size={14} /> 余额趋势</h3>
              </div>
              <div className="p-5">
                {balanceChartData.length === 0 ? (
                  <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">暂无数据</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={balanceChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#bbb" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#bbb" tickFormatter={(v: number) => `¥${v}`} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => `¥${(v as number).toFixed(2)}`} />
                        <Line type="monotone" dataKey="balance" stroke="#0984e3" strokeWidth={2.5} dot={false} name="余额" />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                      <span className="inline-block w-3 h-0.5 bg-blue-500 align-middle mr-1" /> 每日余额
                      <span className="text-slate-300">|</span>
                      取每日最晚时刻余额
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 充值记录 */}
            {finance.rechargeEvents.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><DollarSign size={14} /> 充值记录</h3>
                </div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-xs text-slate-400">
                        <th className="text-left px-4 py-3 font-medium">时间</th>
                        <th className="text-right px-4 py-3 font-medium">金额</th>
                        <th className="text-center px-4 py-3 font-medium">渠道</th>
                        <th className="text-center px-4 py-3 font-medium">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.rechargeEvents.map(r => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{new Date(r.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">+¥{fmt(r.amount)}</td>
                          <td className="px-4 py-2.5 text-center text-xs text-slate-500">{r.channel}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                              r.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                              r.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {r.status === 'paid' ? '已支付' : r.status === 'pending' ? '待支付' : r.status === 'cancelled' ? '已取消' : r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 流水明细 */}
            {finance.events.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BarChart3 size={14} /> 余额流水明细</h3>
                  <span className="text-xs text-slate-400">{finance.events.length} 条</span>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-xs text-slate-400">
                        <th className="text-left px-4 py-3 font-medium">时间</th>
                        <th className="text-left px-4 py-3 font-medium">类型</th>
                        <th className="text-right px-4 py-3 font-medium">金额</th>
                        <th className="text-right px-4 py-3 font-medium">变更后余额</th>
                        <th className="text-left px-4 py-3 font-medium">说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.events.map(e => {
                        const isInflow = parseFloat(e.amount) > 0
                        return (
                          <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                            <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(e.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                e.type === 'recharge' ? 'bg-emerald-50 text-emerald-600' :
                                e.type === 'order_call' ? 'bg-red-50 text-red-500' :
                                e.type === 'admin_adjust' ? 'bg-amber-50 text-amber-600' :
                                e.type === 'commission' ? 'bg-blue-50 text-blue-600' :
                                e.type === 'withdraw' ? 'bg-purple-50 text-purple-600' :
                                'bg-slate-50 text-slate-500'
                              }`}>
                                {e.type === 'recharge' ? '充值' :
                                 e.type === 'order_call' ? '消费' :
                                 e.type === 'admin_adjust' ? '调账' :
                                 e.type === 'commission' ? '佣金' :
                                 e.type === 'withdraw' ? '提现' : e.type}
                              </span>
                            </td>
                            <td className={`px-4 py-2.5 text-right font-medium ${isInflow ? 'text-emerald-600' : 'text-red-500'}`}>
                              {isInflow ? '+' : ''}¥{fmt(e.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-700">¥{fmt(e.balanceAfter)}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px] truncate">{e.description || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════
     Tab 4: 活跃记录
     ════════════════════════════════════════ */
  function ActivityTab() {
    const [expandedIp, setExpandedIp] = useState(false)
    const displayedIps = expandedIp ? (activity?.ipDistribution ?? []) : (activity?.ipDistribution ?? []).slice(0, 6)

    // 查找模型显示名
    const getModelDisplay = (name: string | null) => {
      const found = modelBreakdown.find(m => m.modelName === name)
      return found?.displayName || name || 'unknown'
    }

    // 热力图数据：补齐30天
    const heatmapDays: { day: string; count: number; weekday: number; week: number }[] = []
    const now = new Date()
    const activityMap = new Map((activity?.dailyActivity ?? []).map(d => [d.day, d.count]))
    for (let i = daysRange - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dayStr = d.toISOString().slice(0, 10)
      heatmapDays.push({
        day: dayStr.slice(5),
        count: activityMap.get(dayStr) ?? 0,
        weekday: d.getDay(),
        week: Math.floor(i / 7),
      })
    }

    const maxHeatCount = Math.max(1, ...heatmapDays.map(d => d.count))
    const getHeatColor = (count: number) => {
      if (count === 0) return 'bg-slate-100'
      const intensity = Math.min(1, count / maxHeatCount)
      if (intensity > 0.75) return 'bg-emerald-500'
      if (intensity > 0.5) return 'bg-emerald-400'
      if (intensity > 0.25) return 'bg-emerald-300'
      return 'bg-emerald-200'
    }

    // 按星期分组显示
    const weeks: { label: string; days: typeof heatmapDays }[] = []
    for (let w = 0; w < Math.ceil(heatmapDays.length / 7); w++) {
      const weekDays = heatmapDays.slice(w * 7, (w + 1) * 7)
      const weekStart = weekDays[0]?.day ?? ''
      weeks.push({ label: weekStart, days: weekDays })
    }

    // 小时分布数据
    const hourlyFull = Array.from({ length: 24 }, (_, i) => {
      const found = activity?.hourlyDistribution.find(h => h.hour === i)
      return { hour: i, count: found?.count ?? 0 }
    })

    return (
      <div className="space-y-4">
        {loadingActivity ? (
          <div className="h-[200px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
        ) : !activity || (activity.dailyActivity.length === 0 && activity.hourlyDistribution.length === 0) ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">暂无活跃数据</div>
        ) : (
          <>
            {/* 活跃热力图 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Activity size={14} /> 每日活跃热力图</h3>
              </div>
              <div className="p-5 overflow-x-auto">
                <div className="flex gap-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                      {week.days.map((d, di) => (
                        <div
                          key={di}
                          title={`${d.day}: ${d.count} 次调用`}
                          className={`w-4 h-4 rounded-sm ${getHeatColor(d.count)} cursor-pointer`}
                        />
                      ))}
                      {week.days.length < 7 && Array.from({ length: 7 - week.days.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="w-4 h-4" />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400">
                  <span>少</span>
                  <span className="w-3 h-3 rounded-sm bg-slate-100" />
                  <span className="w-3 h-3 rounded-sm bg-emerald-200" />
                  <span className="w-3 h-3 rounded-sm bg-emerald-300" />
                  <span className="w-3 h-3 rounded-sm bg-emerald-400" />
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <span>多</span>
                  <span className="text-slate-300 ml-1">|</span>
                  <span>近 {daysRange} 天活跃日 {(activity?.dailyActivity ?? []).filter(d => d.count > 0).length} 天</span>
                </div>
              </div>
            </div>

            {/* 活跃时段 + IP 分布 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 小时活跃分布 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Clock size={14} /> 活跃时段分布</h3>
                </div>
                <div className="p-4 h-[220px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={hourlyFull}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="#bbb" interval={2} />
                      <YAxis tick={{ fontSize: 11 }} stroke="#bbb" />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill="#6c5ce7" radius={[2, 2, 0, 0]} name="调用量" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* IP 分布 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><MapPin size={14} /> IP 分布</h3>
                </div>
                <div className="p-4 max-h-[220px] overflow-y-auto">
                  {displayedIps.length === 0 ? (
                    <div className="text-center text-sm text-slate-400 py-8">暂无 IP 数据</div>
                  ) : (
                    <>
                      {displayedIps.map((ip, i) => {
                        const total = activity?.ipDistribution.reduce((s, p) => s + p.count, 0) ?? 1
                        const pct = (ip.count / total * 100).toFixed(1)
                        const barW = Math.max(4, (ip.count / total) * 100)
                        return (
                          <div key={ip.ip || i} className="flex items-center gap-2 mb-1.5 text-xs">
                            <span className="w-28 truncate text-slate-600 font-mono" title={ip.ip ?? ''}>{ip.ip}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full" style={{ width: `${barW}%` }} />
                            </div>
                            <span className="w-16 text-right text-slate-500">{ip.count.toLocaleString()}</span>
                            <span className="w-10 text-right text-slate-400">{pct}%</span>
                          </div>
                        )
                      })}
                      {(activity?.ipDistribution.length ?? 0) > 6 && (
                        <button onClick={() => setExpandedIp(!expandedIp)}
                          className="text-xs text-blue-500 hover:text-blue-600 mt-1">
                          {expandedIp ? '收起' : `查看全部 ${activity?.ipDistribution.length ?? 0} 个 IP`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 常用模型排行 */}
            {(activity?.modelRanking.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><PieIcon size={14} /> 常用模型排行</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-400">
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">模型名称</th>
                        <th className="text-right px-4 py-3 font-medium">调用次数</th>
                        <th className="text-right px-4 py-3 font-medium">Token 消耗</th>
                        <th className="text-right px-4 py-3 font-medium">占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity!.modelRanking.map((m, i) => {
                        const total = activity!.modelRanking.reduce((s, r) => s + r.count, 0)
                        const pct = total > 0 ? ((m.count / total) * 100).toFixed(1) : '0'
                        return (
                          <tr key={m.modelName || i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                            <td className="px-4 py-2.5 text-xs text-slate-400">{i + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{getModelDisplay(m.modelName)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{m.count.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{(m.totalTokens / 10000).toFixed(1)}万</td>
                            <td className="px-4 py-2.5 text-right text-slate-500">{pct}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════
     Tabs
     ════════════════════════════════════════ */
  function TabBar() {
    return (
      <div className="flex border-b border-slate-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => handleTabChange(tab.key)}
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

  /* ════════════════════════════════════════
     Enterprise Detail Panel (with Tabs)
     ════════════════════════════════════════ */
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
                  <span className="flex items-center gap-1"><Wallet size={13} /> 余额 <strong className="text-emerald-600">¥{fmt(selected!.balance)}</strong></span>
                  {selected!.lastLoginAt && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={12} />
                      最近活跃 {new Date(selected!.lastLoginAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                  <span className="text-slate-400">近 {daysRange} 天 · {trends.length} 天数据</span>
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
            <StatCard icon={<DollarSign size={14} />} label={`${daysRange} 天总消费`} value={`¥${fmt(summary.totalCost)}`} color="text-emerald-600" />
            <StatCard icon={<Activity size={14} />} label="平均成功率" value={fmtPercent(summary.avgSuccessRate)} color="text-amber-600" />
            <StatCard icon={<TrendingUp size={14} />} label="日均消费" value={`¥${fmt(summary.avgDailyCost)}`} color="text-sky-600" />
            <StatCard
              icon={momChange && parseFloat(momChange) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              label="环比变化" value={momChange !== null ? `${parseFloat(momChange) >= 0 ? '+' : ''}${momChange}%` : '—'}
              sub="后半周期 vs 前半周期"
              color={momChange !== null && parseFloat(momChange) >= 0 ? 'text-emerald-600' : 'text-red-500'}
            />
          </div>
        )}

        {/* Tab 切换 */}
        <TabBar />

        {/* Tab 内容 */}
        {activeTab === 'analysis' && <AnalysisTab />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'finance' && <FinanceTab />}
        {activeTab === 'activity' && <ActivityTab />}
      </div>
    )
  }

  /* ════════════════════════════════════════
     Main Render
     ════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">企业数据分析</h1>
        <FeatureDescription page="admin/enterprise-analysis" className="ml-2" />
        <p className="text-sm text-slate-500 mt-1">
          {selected ? `查看「${selected.companyName || selected.email}」的详细分析数据` : '搜索企业查看详细分析，或浏览全局企业数据概览'}
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
                    <div className="text-xs font-semibold text-emerald-600">¥{fmt(u.balance)}</div>
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

      {selected ? <EnterpriseDetailPanel /> : <EnterpriseOverviewPanel />}
    </div>
  )
}
