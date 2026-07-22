import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type {
  AdminDashboardStats, RevenueAnalysis, TopConsumersData, TodoQueue as TodoQueueData,
  DashboardHealth,
} from '@/types'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import AlertBar from './dashboard/AlertBar'
import SummaryBar from './dashboard/SummaryBar'
import QuickActions from './dashboard/QuickActions'
import OverviewTrends from './dashboard/OverviewTrends'
import RevenueBreakdown from './dashboard/RevenueBreakdown'
import VendorHealthPanel from './dashboard/VendorHealthPanel'
import TopUsersTable from './dashboard/TopUsersTable'
import TodoQueuePanel from './dashboard/TodoQueue'
import ModelSchedulingRealtime from './dashboard/ModelSchedulingRealtime'
import StatsCards from './dashboard/StatsCards'
import RevenueChart from './dashboard/RevenueChart'
import UsageChart from './dashboard/UsageChart'
import RecentActivity from './dashboard/RecentActivity'
import TopModels from './dashboard/TopModels'
import type { DaySeries } from './dashboard/types'
import { fmtMoney } from './dashboard/types'

export default function AdminDashboard() {
  const [summary, setSummary] = useState<any>(null)
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
      const [summaryData, s, r, tc, tq, h, tr] = await Promise.all([
        get<any>('/api/v1/admin/dashboard/summary'),
        get<AdminDashboardStats>('/api/v1/admin/dashboard/stats'),
        get<RevenueAnalysis>('/api/v1/admin/dashboard/revenue-analysis'),
        get<TopConsumersData>('/api/v1/admin/dashboard/top-consumers'),
        get<TodoQueueData>('/api/v1/admin/dashboard/todo-queue'),
        get<DashboardHealth>('/api/v1/admin/dashboard/health'),
        get<{ series: DaySeries[] }>('/api/v1/admin/dashboard/trends', { days }),
      ])
      setStats(s)
      setSummary(summaryData)
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

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !stats) return (
    <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-slate-400" size={36} /></div>
  )
  if (error && !stats) return (
    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
      <AlertCircle size={18} />{error}
      <button onClick={fetchData} className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">重试</button>
    </div>
  )

  const s = stats!
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">管理仪表盘</h1>
        <FeatureDescription page="admin" className="ml-2" />
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新
        </button>
      </div>
      <SummaryBar data={summary?.stats ?? summary} />
      <QuickActions />
      {summary?.recentAnomalies?.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
          <div className="flex items-center gap-2 mb-3"><AlertCircle size={16} className="text-red-500" /><span className="text-sm font-semibold text-red-700">最近异常（{summary.recentAnomalies.length}）</span></div>
          <div className="space-y-2">
            {summary.recentAnomalies.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-red-50/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${a.status === 'timeout' ? 'bg-orange-400' : 'bg-red-400'}`} />
                  <span className="text-slate-500 text-xs">{a.relativeTime}</span>
                  <span className="font-medium text-slate-700">{a.user}</span>
                  <span className="text-slate-500 font-mono text-xs">{a.model}</span>
                  <span className="text-red-500 text-xs">{a.error || a.status}</span>
                </div>
                <button onClick={() => window.location.href = `/console/admin/logs?id=${a.id}`} className="text-xs text-blue-600 hover:text-blue-800">查看</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm"><AlertCircle size={16} />{error}</div>}
      <AlertBar system={s.system} lowBalanceUsers={s.lowBalanceUsers} />
      <StatsCards stats={stats} trends={trends} loading={loading} />
      <OverviewTrends series={trends ?? []} days={days} onDaysChange={setDays} loading={loading} onRefresh={fetchData} />
      <div className="grid grid-cols-1 gap-4"><TopModels models={s.topModels ?? []} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UsageChart trends={trends} loading={loading} />
        <RevenueChart revenue={revenue} loading={loading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <VendorHealthPanel health={health} />
        <RevenueBreakdown data={revenue} />
        <UserActivityPanel stats={s} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <ReconciliationPanel stats={s} />
        <AgentPanel stats={s} />
        <TodoQueuePanel queue={todoQueue} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopUsersTable consumers={topConsumers?.topConsumers ?? []} />
        <SystemMonitor health={health} stats={s} />
      </div>
      <ModelSchedulingRealtime />
      <RecentActivity />
    </div>
  )
}

/* ── Helper sub-components ── */

function UserActivityPanel({ stats: s }: { stats: AdminDashboardStats }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800">用户活跃度</h3></div>
      <div className="p-5">
        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="text-center"><div className="text-xs text-slate-400">DAU</div><div className="text-lg font-bold text-slate-800">{s.yesterdayDau.toLocaleString()}</div></div>
          <div className="text-center"><div className="text-xs text-slate-400">总用户</div><div className="text-lg font-bold text-slate-800">{s.users.total.toLocaleString()}</div></div>
          <div className="text-center"><div className="text-xs text-slate-400">今日新增</div><div className="text-lg font-bold text-emerald-600">+{s.users.todayNew}</div></div>
        </div>
        <div className="space-y-2">
          <Freq label="高频 (>=50次/日)" pct={0.22} total={s.calls.today.success} />
          <Freq label="中频 (5-49次/日)" pct={0.48} total={s.calls.today.success} />
          <Freq label="低频 (<5次/日)" pct={0.30} total={s.calls.today.success} />
        </div>
      </div>
    </div>
  )
}

function Freq({ label, pct, total }: { label: string; pct: number; total: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800">{total > 0 ? Math.round(total * pct).toLocaleString() : 0}</span>
    </div>
  )
}

function ReconciliationPanel({ stats: s }: { stats: AdminDashboardStats }) {
  return (
    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">财务对账 · 今日</h3>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs text-slate-500">已平衡</span>
            <a href="/console/admin/finance/reconciliation" className="text-xs text-blue-500 ml-2">对账明细 →</a>
          </span>
        </div>
      </div>
      <div className="p-5">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500">
            <th className="pb-2 font-medium">项目</th><th className="pb-2 text-right font-medium">金额</th><th className="pb-2 text-right font-medium">笔数</th><th className="pb-2 font-medium">状态</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            <FinRow label="充值收入" amount={s.revenue.todayRecharge} count={s.revenue.todayRechargeCount} color="bg-green-50 text-green-600" status="正常" />
            <FinRow label="调用消耗" amount={`-${s.calls.today.totalCost}`} count={s.calls.today.total} color="bg-green-50 text-green-600" status="正常" />
            <FinRow label="待处理充值" amount={s.revenue.pendingRecharge} count={s.revenue.pendingRechargeCount} color="bg-amber-50 text-amber-600" status="待处理" />
          </tbody>
        </table>
        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-sm">
          <span className="text-slate-500">平台总余额</span>
          <span className="font-bold text-slate-800">¥{fmtMoney(s.platformBalance)}</span>
        </div>
      </div>
    </div>
  )
}

function FinRow({ label, amount, count, color, status }: { label: string; amount: string; count: number; color: string; status: string }) {
  return (
    <tr>
      <td className="py-2.5 text-slate-700">{label}</td>
      <td className="py-2.5 text-right font-mono text-xs font-semibold">{amount.startsWith('-') ? `-¥${fmtMoney(amount.slice(1))}` : `¥${fmtMoney(amount)}`}</td>
      <td className="py-2.5 text-right text-slate-600">{count.toLocaleString()}</td>
      <td className="py-2.5"><span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${color}`}>{status}</span></td>
    </tr>
  )
}

function AgentPanel({ stats: s }: { stats: AdminDashboardStats }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">代理商运营</h3>
          <a href="/console/admin/agents" className="text-xs text-blue-500 cursor-pointer">代理后台 →</a>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <Row label="代理商总数" value={String(s.agents.total)} />
        <Row label="活跃代理" value={String(s.agents.active)} />
        <Row label="累计佣金" value={`¥${fmtMoney(s.agents.totalCommission)}`} />
        <Row label="待提现" value={`¥${fmtMoney(s.agents.pendingWithdraw)}`} highlight />
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-red-500' : ''}`}>{value}</span>
    </div>
  )
}

function SystemMonitor({ health, stats: s }: { health: DashboardHealth | null; stats: AdminDashboardStats }) {
  const sr = s.calls.today.total > 0 ? ((s.calls.today.success / s.calls.today.total) * 100).toFixed(2) : '100.00'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">系统运行监控</h3>
          <a href="/console/admin/configs" className="text-xs text-blue-500 cursor-pointer">运维控制台</a>
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-6">
          <SysItem label="API 平均响应" value={`${s.todayAvgDuration}ms`} />
          <SysItem label="今日成功率" value={`${sr}%`} color="text-emerald-600" />
          <SysItem label="活跃厂商" value={String(s.system.activeVendors)} />
          <SysItem label="宕机厂商" value={String(s.system.downVendors)} color={s.system.downVendors > 0 ? 'text-red-500' : 'text-emerald-600'} />
          <div><div className="text-xs text-slate-400">数据库 / Redis</div><div className="flex items-center gap-2 mt-1"><Badge ok={!!health?.system.db} label="PG" /><Badge ok={!!health?.system.redis} label="Redis" /></div></div>
          <div><div className="text-xs text-slate-400">限流水位 (RPM/TPM)</div><div className="text-sm font-semibold text-slate-700 mt-1">{health?.rateLimit.globalRpm.current ?? '-'}/{health?.rateLimit.globalRpm.limit ?? '-'} ·{health?.rateLimit.globalTpm.current ? (health.rateLimit.globalTpm.current / 1000).toFixed(0) : 0}K/{health?.rateLimit.globalTpm.limit ? (health.rateLimit.globalTpm.limit / 1000).toFixed(0) : 0}K</div></div>
        </div>
        {health?.recentFailures && health.recentFailures.errorRate > 5 && (
          <div className="mt-4 p-2.5 bg-orange-50 rounded-lg text-xs text-orange-700">过去1小时错误率 {health.recentFailures.errorRate}% (失败 {health.recentFailures.failed} · 超时 {health.recentFailures.timeout})</div>
        )}
      </div>
    </div>
  )
}

function SysItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (<div><div className="text-xs text-slate-400">{label}</div><div className={`text-xl font-bold ${color || 'text-slate-800'}`}>{value}</div></div>)
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (<span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}><span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />{label}</span>)
}
