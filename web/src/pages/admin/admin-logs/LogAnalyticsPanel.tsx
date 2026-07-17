import { useState, useEffect, useMemo } from 'react'
import { get } from '@/lib/api'
import {
  BarChart3, XCircle, TrendingUp, Users, AlertTriangle, Clock, Download,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { AdminLogItem, LogAnalyticsSummary, ErrorPattern, TrendPoint, HourlyPoint, TopConsumer } from './types'
import { fmtTokens, fmtCost } from './types'

/* ── Config ── */

const TABS = [
  { key: 'overview', label: '概览', icon: BarChart3 },
  { key: 'errors', label: '错误分析', icon: XCircle },
  { key: 'trends', label: '趋势', icon: TrendingUp },
  { key: 'users', label: '用户排行', icon: Users },
] as const

type TabKey = (typeof TABS)[number]['key']

/* ── Client-side analytics helpers ── */

function useClientAnalytics(logs: AdminLogItem[]) {
  return useMemo(() => {
    const sc = logs.filter(l => l.status === 'success').length
    const fc = logs.filter(l => l.status === 'failed').length
    const tc = logs.filter(l => l.status === 'timeout').length
    const cc = logs.filter(l => l.status === 'cancelled').length
    const totalTokens = logs.reduce((s, l) => s + (l.totalTokens || 0), 0)
    const totalCost = logs.reduce((s, l) => s + parseFloat(l.cost || '0'), 0)
    const avgDuration = logs.length > 0 ? Math.round(logs.reduce((s, l) => s + (l.durationMs || 0), 0) / logs.length) : 0

    const summary: LogAnalyticsSummary = {
      totalCalls: logs.length, successCalls: sc, failedCalls: fc, timeoutCalls: tc, cancelledCalls: cc,
      totalTokens, totalCost: totalCost.toFixed(4), avgDuration,
      uniqueUsers: new Set(logs.map(l => l.userEmail).filter(Boolean)).size,
      uniqueModels: new Set(logs.map(l => l.modelName).filter(Boolean)).size,
      successRate: logs.length > 0 ? Math.round((sc / logs.length) * 10_000) / 100 : 100,
    }

    const errorMap = new Map<string, { count: number; modelName: string; lastSeen: string }>()
    logs.filter(l => l.status === 'failed' && l.errorMessage).forEach(l => {
      const k = l.errorMessage!
      const e = errorMap.get(k) || { count: 0, modelName: l.modelName || '未知', lastSeen: l.createdAt }
      e.count++
      if (l.createdAt > e.lastSeen) e.lastSeen = l.createdAt
      errorMap.set(k, e)
    })
    const errors: ErrorPattern[] = Array.from(errorMap.entries())
      .map(([errorMessage, r]) => ({ errorMessage, ...r }))
      .sort((a, b) => b.count - a.count).slice(0, 20)

    const buckets = Array.from({ length: 24 }, () => ({ calls: 0, tokens: 0 }))
    logs.forEach(l => { const h = new Date(l.createdAt).getHours(); buckets[h].calls++; buckets[h].tokens += l.totalTokens || 0 })
    const hourly: HourlyPoint[] = buckets.map((b, hour) => ({ hour, totalCalls: b.calls, totalTokens: b.tokens }))

    const dayMap = new Map<string, { calls: number; s: number; f: number; tokens: number; cost: number }>()
    logs.forEach(l => {
      const d = l.createdAt.slice(0, 10)
      const e = dayMap.get(d) || { calls: 0, s: 0, f: 0, tokens: 0, cost: 0 }
      e.calls++; if (l.status === 'success') e.s++; else if (l.status === 'failed') e.f++
      e.tokens += l.totalTokens || 0; e.cost += parseFloat(l.cost || '0')
      dayMap.set(d, e)
    })
    const trends: TrendPoint[] = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e]) => ({ date, totalCalls: e.calls, successCalls: e.s, failedCalls: e.f, totalTokens: e.tokens, totalCost: e.cost.toFixed(6) }))
      .slice(-7)

    const umap = new Map<string, { calls: number; tokens: number; cost: number; email: string }>()
    logs.forEach(l => {
      const k = l.userEmail || 'anonymous'
      const e = umap.get(k) || { calls: 0, tokens: 0, cost: 0, email: l.userEmail || '匿名' }
      e.calls++; e.tokens += l.totalTokens || 0; e.cost += parseFloat(l.cost || '0')
      umap.set(k, e)
    })
    const consumers: TopConsumer[] = Array.from(umap.entries())
      .map(([, e], i) => ({ userId: i, email: e.email, totalCalls: e.calls, totalTokens: e.tokens, totalCost: e.cost.toFixed(6) }))
      .sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 20)

    return { summary, errors, hourly, trends, consumers }
  }, [logs])
}

/* ── Sub-tabs ── */

function OverviewTab({ s }: { s: LogAnalyticsSummary }) {
  const bars = [
    { label: '成功', count: s.successCalls, color: 'bg-emerald-500' },
    { label: '失败', count: s.failedCalls, color: 'bg-red-500' },
    { label: '超时', count: s.timeoutCalls, color: 'bg-orange-500' },
    { label: '取消', count: s.cancelledCalls, color: 'bg-gray-400' },
  ].filter(b => b.count > 0)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard title="总调用" value={s.totalCalls.toLocaleString()} sub={`成功 ${s.successCalls} / 失败 ${s.failedCalls}`} borderColor="border-blue-200" bgColor="bg-blue-50" />
        <MiniCard title="Token 消耗" value={fmtTokens(s.totalTokens)} sub={s.totalTokens.toLocaleString()} borderColor="border-purple-200" bgColor="bg-purple-50" />
        <MiniCard title="总花费" value={fmtCost(s.totalCost)} sub={`成功率 ${s.successRate}% · ${s.uniqueUsers} 用户`} borderColor="border-green-200" bgColor="bg-green-50" />
        <MiniCard title="平均延迟" value={`${s.avgDuration}ms`} sub={`${s.uniqueModels} 个模型`} borderColor="border-amber-200" bgColor="bg-amber-50" />
      </div>
      {s.totalCalls > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500 mb-2">状态分布</p>
          {bars.map(b => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-8 text-right">{b.label}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                <div className={`${b.color} h-3 rounded-full`} style={{ width: `${(b.count / s.totalCalls) * 100}%`, minWidth: b.count > 0 ? 4 : 0 }} />
              </div>
              <span className="text-[10px] text-slate-500 w-12 text-right">{b.count.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 w-10 text-right">{((b.count / s.totalCalls) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniCard({ title, value, sub, borderColor, bgColor }: { title: string; value: string; sub: string; borderColor: string; bgColor: string }) {
  return (
    <div className={`rounded-lg border p-3 ${borderColor} ${bgColor}`}>
      <p className="text-xs text-slate-500 mb-1">{title}</p>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

function ErrorsTab({ errors }: { errors: ErrorPattern[] }) {
  if (!errors.length) return <Empty icon={AlertTriangle} msg="暂无错误记录" iconClass="text-emerald-400" />
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-50 text-left">
          <th className="px-4 py-2.5 font-medium text-slate-500">模型</th>
          <th className="px-4 py-2.5 font-medium text-slate-500">错误信息</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">次数</th>
          <th className="px-4 py-2.5 font-medium text-slate-500">最后出现</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {errors.map((e, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-700">{e.modelName}</td>
              <td className="px-4 py-2.5 text-red-600 max-w-[400px] truncate">{e.errorMessage}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600">{e.count}</td>
              <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{e.lastSeen ? new Date(e.lastSeen).toLocaleString('zh-CN') : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendsTab({ trends, hourly }: { trends: TrendPoint[]; hourly: HourlyPoint[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-500 mb-3"><TrendingUp size={12} className="inline mr-1 text-blue-500" />最近 7 天调用趋势</p>
        {!trends.length ? <EmptyBox /> : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="totalCalls" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} name="调用" strokeWidth={2} />
                <Area type="monotone" dataKey="successCalls" stroke="#10B981" fill="#10B981" fillOpacity={0.1} name="成功" strokeWidth={2} />
                <Area type="monotone" dataKey="failedCalls" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} name="失败" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-500 mb-3"><Clock size={12} className="inline mr-1 text-indigo-500" />24 小时调用分布</p>
        {!hourly.length ? <EmptyBox /> : (() => {
          const maxCalls = Math.max(1, ...hourly.map(h => h.totalCalls))
          return (
            <div className="grid gap-px bg-slate-100 rounded-lg overflow-hidden" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {hourly.map(h => {
                const int = maxCalls > 0 ? h.totalCalls / maxCalls : 0
                const bg = int > 0.7 ? 'bg-blue-500' : int > 0.4 ? 'bg-blue-400' : int > 0.1 ? 'bg-blue-200' : 'bg-slate-50'
                return (
                  <div key={h.hour} className={`${bg} p-2 text-center`} title={`${h.hour}:00 - ${h.totalCalls}次 / ${fmtTokens(h.totalTokens)}`}>
                    <span className={int > 0.4 ? 'text-white text-[9px] font-mono' : 'text-[9px] text-slate-600 font-mono'}>{h.hour}</span>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function UsersTab({ consumers }: { consumers: TopConsumer[] }) {
  if (!consumers.length) return <Empty msg="暂无数据" />
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-50 text-left">
          <th className="px-4 py-2.5 font-medium text-slate-500">用户</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">调用</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">Token</th>
          <th className="px-4 py-2.5 font-medium text-slate-500 text-right">花费</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {consumers.map((u, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[200px] truncate">{u.nickname || u.email || `用户 #${u.userId}`}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{u.totalCalls.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{fmtTokens(u.totalTokens)}</td>
              <td className="px-4 py-2.5 text-right text-slate-900 font-mono font-medium">{fmtCost(u.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Empty({ icon: Icon = AlertTriangle, msg, iconClass = 'text-slate-400' }: { icon?: any; msg: string; iconClass?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 py-8 text-center text-sm text-slate-400">
      <Icon size={24} className={`mx-auto mb-2 ${iconClass}`} />
      {msg}
    </div>
  )
}

function EmptyBox() {
  return <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
}

/* ── Main ── */

export default function LogAnalyticsPanel({ logs }: { logs: AdminLogItem[] }) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [server, setServer] = useState<{
    summary: LogAnalyticsSummary; errors: ErrorPattern[]; trends: TrendPoint[]
    hourly: HourlyPoint[]; topConsumers: TopConsumer[]
  } | null>(null)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    setApiError('')
    get('/api/v1/admin/logs/analytics', { limit: 1000 })
      .then(setServer)
      .catch((err: any) => setApiError(err.message || '分析数据加载失败'))
  }, [])

  const client = useClientAnalytics(logs)
  const summary = server?.summary ?? client.summary
  const errorPatterns = server?.errors ?? client.errors
  const trendData = server?.trends ?? client.trends
  const hourlyData = server?.hourly ?? client.hourly
  const topConsumers = server?.topConsumers ?? client.consumers

  const handleExport = () => {
    const token = localStorage.getItem('accessToken')
    const a = document.createElement('a')
    a.href = `/api/v1/admin/logs/analytics/export?tab=${tab}${token ? `&token=${token}` : ''}`
    a.download = `logs_analytics_${tab}.csv`
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          <Download size={12} /> 导出{tab === 'overview' ? '概览' : tab === 'errors' ? '错误' : tab === 'trends' ? '趋势' : '用户'}
        </button>
      </div>

      {apiError && <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">{apiError} — 使用当前页面数据展示</div>}

      {tab === 'overview' && <OverviewTab s={summary} />}
      {tab === 'errors' && <ErrorsTab errors={errorPatterns} />}
      {tab === 'trends' && <TrendsTab trends={trendData} hourly={hourlyData} />}
      {tab === 'users' && <UsersTab consumers={topConsumers} />}
    </div>
  )
}
