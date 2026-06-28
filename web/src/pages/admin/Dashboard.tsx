import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AdminDashboardStats } from '@/types'
import SystemHealthPanel from './SystemHealthPanel'
import TrendsCharts from './TrendsCharts'
import {
  Loader2,
  AlertCircle,
  Users,
  UserPlus,
  PhoneCall,
  DollarSign,
  Clock,
  BadgeCheck,
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

/* ── local types for recent activity ── */

interface RecentRecharge {
  id: number
  userId: number
  email: string
  nickname?: string
  amount: string
  status: string
  createdAt: string
}

interface RecentCall {
  id: number
  userId: number
  email: string
  modelName: string
  totalTokens: number
  cost: string
  status: string
  duration: number
  createdAt: string
}

interface RecentActivity {
  recentRecharges: RecentRecharge[]
  recentCalls: RecentCall[]
}

/* ── helpers ── */

function fmtMoney(v: string | number, decimals = 4): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toFixed(decimals)
}

function pct(a: number, b: number): string {
  if (b === 0 && a === 0) return '0%'
  if (b === 0) return '+∞'
  const diff = ((a - b) / b) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
}

/* ── status / status label maps ── */

const callStatusLabel: Record<string, string> = {
  success: '成功',
  failed: '失败',
  timeout: '超时',
}

const callStatusColor: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  timeout: 'bg-yellow-100 text-yellow-700',
}

const rechargeStatusLabel: Record<string, string> = {
  pending: '待处理',
  paid: '已完成',
  failed: '失败',
}

const rechargeStatusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

/* ════════════════════════════════════════
   Dashboard Component
   ════════════════════════════════════════ */

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [recent, setRecent] = useState<RecentActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, r] = await Promise.all([
        get<AdminDashboardStats>('/api/v1/admin/dashboard/stats'),
        get<RecentActivity>('/api/v1/admin/dashboard/recent-activity'),
      ])
      setStats(s)
      setRecent(r)
    } catch (err: any) {
      setError(err.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── loading state ── */
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
        <AlertCircle size={18} />
        {error}
        <button
          onClick={fetchData}
          className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
        >
          重试
        </button>
      </div>
    )
  }

  /* ── derived helpers for display ── */
  const s = stats!

  const statCards = [
    {
      label: '总用户数',
      value: s.users.total.toLocaleString(),
      icon: Users,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '今日新增用户',
      value: s.users.todayNew.toLocaleString(),
      icon: UserPlus,
      color: 'text-emerald-600 bg-emerald-50',
      delta: {
        value: pct(s.users.todayNew, s.users.yesterdayNew),
        up: s.users.todayNew >= s.users.yesterdayNew,
      },
    },
    {
      label: '今日调用次数',
      value: s.calls.today.total.toLocaleString(),
      icon: PhoneCall,
      color: 'text-violet-600 bg-violet-50',
      delta: {
        value: pct(s.calls.today.total, s.calls.yesterday.total),
        up: s.calls.today.total >= s.calls.yesterday.total,
      },
    },
    {
      label: '今日收入',
      value: `¥${fmtMoney(s.revenue.todayRecharge, 2)}`,
      icon: DollarSign,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: '安全事件(未确认)',
      value: (s as any).security?.unacknowledgedHighRisk ?? 0,
      icon: ShieldAlert,
      color: (s as any).security?.unacknowledgedHighRisk > 0
        ? 'text-red-600 bg-red-50'
        : 'text-green-600 bg-green-50',
      sub: (s as any).security
        ? `熔断${(s as any).security.activeCircuits}个 · 封禁IP${(s as any).security.bannedIps}个`
        : '',
    } as any,
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">仪表盘</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
            {'sub' in card && card.sub && (
              <div className="mt-2 text-xs text-slate-500">{card.sub}</div>
            )}
            {'delta' in card && card.delta && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                {card.delta.up ? (
                  <TrendingUp size={13} className="text-green-600" />
                ) : (
                  <TrendingDown size={13} className="text-red-600" />
                )}
                <span className={card.delta.up ? 'text-green-600' : 'text-red-600'}>
                  较昨日 {card.delta.value}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Pending Items ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Recharges */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-orange-600" />
            <h2 className="text-base font-semibold text-slate-800">待处理充值</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">待处理笔数</p>
              <p className="text-2xl font-bold text-orange-600">
                {s.revenue.pendingRechargeCount}
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">待处理金额</p>
              <p className="text-2xl font-bold text-orange-600">
                ¥{fmtMoney(s.revenue.pendingRecharge, 2)}
              </p>
            </div>
          </div>
        </div>

        {/* Pending Real-name Reviews */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BadgeCheck size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">待审核实名</h2>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">待审核</p>
            <p className="text-3xl font-bold text-blue-600">{s.pendingRealName}</p>
            <p className="text-xs text-slate-400 mt-1">条实名认证申请</p>
          </div>
        </div>
      </div>

      {/* ── Top 5 Models ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">今日热门模型 Top 5</h2>
          </div>
        </div>
        {s.topModels.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-5 py-3 text-sm font-medium text-slate-500">排名</th>
                  <th className="px-5 py-3 text-sm font-medium text-slate-500">模型名称</th>
                  <th className="px-5 py-3 text-sm font-medium text-slate-500">调用次数</th>
                  <th className="px-5 py-3 text-sm font-medium text-slate-500">Token 消耗</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {s.topModels.map((m, idx) => (
                  <tr key={m.modelName} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          idx === 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : idx === 1
                              ? 'bg-slate-100 text-slate-600'
                              : idx === 2
                                ? 'bg-amber-100 text-amber-700'
                                : 'text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-900 font-medium">
                      {m.modelName}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">{m.total.toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {m.totalTokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Trends ── */}
      <TrendsCharts />

      {/* ── System Health ── */}
      <SystemHealthPanel />

      {/* ── Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Recharges */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" />
              <h2 className="text-base font-semibold text-slate-800">最近充值</h2>
            </div>
          </div>
          {!recent || recent.recentRecharges.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">暂无充值记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recent.recentRecharges.slice(0, 6).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {r.nickname || r.email}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        ¥{fmtMoney(r.amount, 2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            rechargeStatusColor[r.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {rechargeStatusLabel[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
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
              <PhoneCall size={18} className="text-violet-600" />
              <h2 className="text-base font-semibold text-slate-800">最近调用</h2>
            </div>
          </div>
          {!recent || recent.recentCalls.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">暂无调用记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">Tokens</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                    <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recent.recentCalls.slice(0, 6).map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-900">{c.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[130px] truncate" title={c.modelName}>
                        {c.modelName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {c.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            callStatusColor[c.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {callStatusLabel[c.status] || c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
