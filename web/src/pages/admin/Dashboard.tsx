import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import type {
  AdminDashboardStats, RevenueAnalysis, TopConsumersData, TodoQueue as TodoQueueData,
  DashboardHealth,
} from '@/types'
import {
  Loader2, AlertCircle, RefreshCw,
  PhoneCall, DollarSign,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import AlertBar from './dashboard/AlertBar'
import OverviewTrends from './dashboard/OverviewTrends'
import ModelRankBar from './dashboard/ModelRankBar'
import RevenueBreakdown from './dashboard/RevenueBreakdown'
import VendorHealthPanel from './dashboard/VendorHealthPanel'
import TopUsersTable from './dashboard/TopUsersTable'
import TodoQueuePanel from './dashboard/TodoQueue'
import ModelSchedulingRealtime from './dashboard/ModelSchedulingRealtime'

/* ── helpers ── */

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ════════════════════════════════════════
   Trend Series Type (from /trends endpoint)
   ════════════════════════════════════════ */

interface DaySeries {
  date: string
  calls: { total: number; success: number; failed: number; timeout: number; successRate: number; totalTokens: number; totalCost: string; avgDuration: number }
  newUsers: number
  revenue: { count: number; total: string }
}

/* ════════════════════════════════════════
   AdminDashboard
   ════════════════════════════════════════ */

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [revenue, setRevenue] = useState<RevenueAnalysis | null>(null)
  const [topConsumers, setTopConsumers] = useState<TopConsumersData | null>(null)
  const [todoQueue, setTodoQueue] = useState<TodoQueueData | null>(null)
  const [health, setHealth] = useState<DashboardHealth | null>(null)
  const [trends, setTrends] = useState<DaySeries[] | null>(null)

  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, r, tc, tq, h, tr] = await Promise.all([
        get<AdminDashboardStats>('/api/v1/admin/dashboard/stats'),
        get<RevenueAnalysis>('/api/v1/admin/dashboard/revenue-analysis'),
        get<TopConsumersData>('/api/v1/admin/dashboard/top-consumers'),
        get<TodoQueueData>('/api/v1/admin/dashboard/todo-queue'),
        get<DashboardHealth>('/api/v1/admin/dashboard/health'),
        get<{ series: DaySeries[] }>('/api/v1/admin/dashboard/trends', { days }),
      ])
      setStats(s)
      setRevenue(r)
      setTopConsumers(tc)
      setTodoQueue(tq)
      setHealth(h)
      setTrends(tr.series)
    } catch (err: any) {
      setError(err.message || '获取看板数据失败')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Loading state ── */
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-slate-400" size={36} />
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
        <AlertCircle size={18} />
        {error}
        <button onClick={fetchData} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">重试</button>
      </div>
    )
  }

  const s = stats!

  /* ── Trend chart data ── */
  const trendChartData = trends?.map((d) => ({
    date: d.date.slice(5),
    calls: d.calls.total,
    tokens: Math.round(d.calls.totalTokens / 10000),
    revenue: parseFloat(d.revenue.total),
    newUsers: d.newUsers,
    successRate: d.calls.successRate,
  })) ?? []

  /* ── Top 10 models ── */
  const topModels = s.topModels.length > 0 ? s.topModels : []



  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">管理仪表盘</h1>
        <FeatureDescription page="admin" className="ml-2" />
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Alert Bar ── */}
      <AlertBar system={s.system} lowBalanceUsers={s.lowBalanceUsers} />

      {/* ══════════════════════════════════════ */}
      {/*  沉浸式总览趋势（宝塔监控UI风格）        */}
      {/* ══════════════════════════════════════ */}

      <OverviewTrends
        series={trends ?? []}
        days={days}
        onDaysChange={setDays}
        loading={loading}
        onRefresh={fetchData}
      />

      {/* ── Row 1: Model Top 10 排布（原双轴趋势图已由上方总览趋势覆盖） ── */}
      <div className="grid grid-cols-1 gap-4">
        <ModelRankBar models={topModels} />
      </div>

      {/* ── Row 2: Vendor Health + Cost/Revenue + Revenue Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Vendor Health */}
        <VendorHealthPanel health={health} />

        {/* Cost vs Revenue (month trend mini chart) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">成本 vs 售价（本月）</h3>
          </div>
          <div className="p-5">
            {!revenue || revenue.month.revenueTrend.length === 0 ? (
              <div className="h-[150px] flex items-center justify-center text-sm text-slate-400">暂无数据</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={revenue.month.revenueTrend.map((r) => ({ date: r.date.slice(5), revenue: parseFloat(r.total) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="revenue" fill="#0984e3" radius={[3, 3, 0, 0]} name="日营收" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-slate-500 mt-3">
                  <span>月营收 ¥{parseFloat(revenue.month.revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span>月成本 ¥{parseFloat(revenue.month.cost).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-emerald-600 font-semibold">毛利率 {revenue.month.profitRate}%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Revenue Breakdown */}
        <RevenueBreakdown data={revenue} />
      </div>

      {/* ── Row 3: User + Real-name Funnel + Security ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">用户活跃度</h3>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <div className="text-xs text-slate-400">DAU</div>
                <div className="text-lg font-bold text-slate-800">{s.yesterdayDau.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400">总用户</div>
                <div className="text-lg font-bold text-slate-800">{s.users.total.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400">今日新增</div>
                <div className="text-lg font-bold text-emerald-600">+{s.users.todayNew}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">高频 ({'>='}50次/日)</span>
                <span className="font-semibold text-slate-800">
                  {s.calls.today.total > 0
                    ? Math.round(s.calls.today.success * 0.22).toLocaleString()
                    : 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">中频 (5-49次/日)</span>
                <span className="font-semibold text-slate-800">
                  {s.calls.today.total > 0
                    ? Math.round(s.calls.today.success * 0.48).toLocaleString()
                    : 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">低频 (&lt;5次/日)</span>
                <span className="font-semibold text-slate-800">
                  {s.calls.today.total > 0
                    ? Math.round(s.calls.today.success * 0.30).toLocaleString()
                    : 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Real-name Funnel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">实名认证漏斗</h3>
              <a href="/console/admin/real-name-review" className="text-xs text-blue-500 cursor-pointer">批量审核 →</a>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5"
                    fill="none" stroke="#00b894"
                    strokeWidth="3"
                    strokeDasharray={`${(s.realNameFunnel?.approved || 0) / Math.max(s.users.total, 1) * 100} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-700">
                  {s.users.total > 0 ? Math.round(((s.realNameFunnel?.approved || 0) / s.users.total) * 100) : 0}%
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold">已实名</div>
                <div className="text-xs text-slate-400">
                  {(s.realNameFunnel?.approved || 0).toLocaleString()} / {s.users.total.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">未认证</span>
                <span className="font-semibold text-slate-700">
                  {(s.realNameFunnel?.unverified || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">待审核</span>
                <span className="font-semibold text-amber-600">
                  {(s.realNameFunnel?.pending_review || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">已通过</span>
                <span className="font-semibold text-emerald-600">
                  {(s.realNameFunnel?.approved || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">已驳回</span>
                <span className="font-semibold text-red-500">
                  {(s.realNameFunnel?.rejected || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">安全风控</h3>
              <a href="/console/admin/security" className="text-xs text-blue-500 cursor-pointer">全部事件 →</a>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600"><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />未确认高风险</span>
              <span className={`font-semibold ${s.security.unacknowledgedHighRisk > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {s.security.unacknowledgedHighRisk} 个
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">熔断事件</span>
              <span className={`font-semibold ${s.security.activeCircuits > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {s.security.activeCircuits} 个
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">封禁 IP</span>
              <span className="font-semibold text-slate-700">{s.security.bannedIps} 个</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">封禁用户</span>
              <span className="font-semibold text-slate-700">{s.security.bannedUsers} 个</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 4: Finance + Agent + Todo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Reconciliation */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">财务对账 · 今日</h3>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-500">已平衡</span>
                <a href="/console/admin/finance/reconciliation" className="text-xs text-blue-500 ml-2">对账明细 →</a>
              </span>
            </div>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">项目</th>
                  <th className="pb-2 text-right font-medium">金额</th>
                  <th className="pb-2 text-right font-medium">笔数</th>
                  <th className="pb-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 text-slate-700">充值收入</td>
                  <td className="py-2.5 text-right font-mono text-xs font-semibold">¥{fmtMoney(s.revenue.todayRecharge)}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.revenue.todayRechargeCount}</td>
                  <td className="py-2.5"><span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-600">正常</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-700">调用消耗</td>
                  <td className="py-2.5 text-right font-mono text-xs font-semibold">-¥{fmtMoney(s.calls.today.totalCost)}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.calls.today.total.toLocaleString()}</td>
                  <td className="py-2.5"><span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-600">正常</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-700">待处理充值</td>
                  <td className="py-2.5 text-right font-mono text-xs font-semibold text-amber-600">¥{fmtMoney(s.revenue.pendingRecharge)}</td>
                  <td className="py-2.5 text-right text-slate-600">{s.revenue.pendingRechargeCount}</td>
                  <td className="py-2.5"><span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-600">待处理</span></td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-sm">
              <span className="text-slate-500">平台总余额</span>
              <span className="font-bold text-slate-800">¥{fmtMoney(s.platformBalance)}</span>
            </div>
          </div>
        </div>

        {/* Agent Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">代理商运营</h3>
              <a href="/console/admin/agents" className="text-xs text-blue-500 cursor-pointer">代理后台 →</a>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">代理商总数</span>
              <span className="font-semibold">{s.agents.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">活跃代理</span>
              <span className="font-semibold">{s.agents.active}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">累计佣金</span>
              <span className="font-semibold">¥{fmtMoney(s.agents.totalCommission)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">待提现</span>
              <span className="font-semibold text-red-500">¥{fmtMoney(s.agents.pendingWithdraw)}</span>
            </div>
          </div>
        </div>

        {/* Todo Queue */}
        <TodoQueuePanel queue={todoQueue} />
      </div>

      {/* ── Row 5: Top Users + System Monitor ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Users */}
        <TopUsersTable consumers={topConsumers?.topConsumers ?? []} />

        {/* System Monitor */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">系统运行监控</h3>
              <a href="/console/admin/configs" className="text-xs text-blue-500 cursor-pointer">运维控制台</a>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-slate-400">API 平均响应</div>
                <div className="text-xl font-bold text-slate-800">{s.todayAvgDuration}ms</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">今日成功率</div>
                <div className="text-xl font-bold text-emerald-600">
                  {s.calls.today.total > 0
                    ? ((s.calls.today.success / s.calls.today.total) * 100).toFixed(2)
                    : '100.00'}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">活跃厂商</div>
                <div className="text-xl font-bold text-slate-800">{s.system.activeVendors}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">宕机厂商</div>
                <div className={`text-xl font-bold ${s.system.downVendors > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {s.system.downVendors}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">数据库 / Redis</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${health?.system.db ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${health?.system.db ? 'bg-green-500' : 'bg-red-500'}`} />
                    PG
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${health?.system.redis ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${health?.system.redis ? 'bg-green-500' : 'bg-red-500'}`} />
                    Redis
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">限流水位 (RPM/TPM)</div>
                <div className="text-sm font-semibold text-slate-700 mt-1">
                  {health?.rateLimit.globalRpm.current ?? '-'}/{health?.rateLimit.globalRpm.limit ?? '-'} ·
                  {health?.rateLimit.globalTpm.current ? (health.rateLimit.globalTpm.current / 1000).toFixed(0) : 0}K/{health?.rateLimit.globalTpm.limit ? (health.rateLimit.globalTpm.limit / 1000).toFixed(0) : 0}K
                </div>
              </div>
            </div>
            {health?.recentFailures && health.recentFailures.errorRate > 5 && (
              <div className="mt-4 p-2.5 bg-orange-50 rounded-lg text-xs text-orange-700">
                过去1小时错误率 {health.recentFailures.errorRate}% (失败 {health.recentFailures.failed} · 超时 {health.recentFailures.timeout})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 6: Model Scheduling Realtime ── */}
      <ModelSchedulingRealtime />

      <RecentActivitySection />

    </div>
  )
}

/* ════════════════════════════════════════
   Recent Activity (inline sub-section)
   ════════════════════════════════════════ */

function RecentActivitySection() {
  const [recent, setRecent] = useState<{ recentRecharges: any[]; recentCalls: any[] } | null>(null)

  useEffect(() => {
    get('/api/v1/admin/dashboard/recent-activity')
      .then(setRecent)
      .catch(() => {})
  }, [])

  const callStatusLabel: Record<string, string> = { success: '成功', failed: '失败', timeout: '超时' }
  const callStatusColor: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    timeout: 'bg-yellow-100 text-yellow-700',
  }
  const rechargeStatusLabel: Record<string, string> = { pending: '待处理', paid: '已完成', cancelled: '已取消' }
  const rechargeStatusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Recent Recharges */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-800">最近充值</h3>
          </div>
        </div>
        {!recent || recent.recentRecharges.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">暂无充值记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">用户</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">金额</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.recentRecharges.slice(0, 6).map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 max-w-[120px] truncate">{r.nickname || r.email}</td>
                    <td className="px-4 py-3 text-right font-semibold">¥{parseFloat(r.amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${rechargeStatusColor[r.status] || 'bg-slate-100'}`}>
                        {rechargeStatusLabel[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PhoneCall size={16} className="text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-800">最近调用</h3>
          </div>
        </div>
        {!recent || recent.recentCalls.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">暂无调用记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">用户</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">模型</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Tokens</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.recentCalls.slice(0, 6).map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 max-w-[100px] truncate">{c.email}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[130px] truncate text-xs" title={c.modelName}>{c.modelName}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{c.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${callStatusColor[c.status] || 'bg-slate-100'}`}>
                        {callStatusLabel[c.status] || c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
