import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get } from '@/lib/api'
import type { AgentStats } from './agents-types'
import FeatureDescription from '@/components/admin/FeatureDescription'
import MiniChart from '@/components/ui/MiniChart'
import AgentsList from './AgentsList'
import WithdrawOrders from './WithdrawOrders'
import {
  AlertCircle,
  Users,
  Wallet,
  TrendingUp,
  Clock,
} from 'lucide-react'

/* ── Tab type ── */

type Tab = 'agents' | 'withdraws'

/* ── 默认空 stats ── */

const EMPTY_STATS: AgentStats = {
  totalAgents: 0,
  totalCommission: '0',
  monthPendingWithdraw: '0',
  monthWithdrawn: '0',
}

/* ── Stats 模拟数据（用于 MiniChart） ── */

function statsTrend(): { value: number; label: string }[] {
  return [
    { value: 60, label: '上月' },
    { value: 85, label: '本月' },
  ]
}

/* ═══════════════════════════════════════
   Agents — 入口页面
   ═══════════════════════════════════════ */

export default function AdminAgents() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('agents')
  const [stats, setStats] = useState<AgentStats>(EMPTY_STATS)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError('')
    try {
      const data = await get<AgentStats>('/api/v1/admin/agents/stats')
      setStats(data)
    } catch (err: any) {
      // 后端可能尚未提供统计接口，静默降级
      if (err.status !== 404 && err.status !== 0) {
        setStatsError(err.message || '获取统计数据失败')
      } else {
        setStats(EMPTY_STATS)
      }
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab)
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">代理管理</h1>
      <FeatureDescription page="admin/agents" className="ml-2" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 总代理数 */}
        <StatsCard
          icon={<Users size={20} />}
          label="总代理数"
          value={stats.totalAgents.toLocaleString()}
          trend={statsTrend()}
          color="blue"
          loading={statsLoading}
        />

        {/* 总佣金 */}
        <StatsCard
          icon={<TrendingUp size={20} />}
          label="总佣金"
          value={`¥${Number(stats.totalCommission || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          trend={statsTrend()}
          color="green"
          loading={statsLoading}
        />

        {/* 本月待提现 */}
        <StatsCard
          icon={<Clock size={20} />}
          label="本月待提现"
          value={`¥${Number(stats.monthPendingWithdraw || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          trend={statsTrend()}
          color="orange"
          loading={statsLoading}
        />

        {/* 本月已提现 */}
        <StatsCard
          icon={<Wallet size={20} />}
          label="本月已提现"
          value={`¥${Number(stats.monthWithdrawn || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          trend={statsTrend()}
          color="purple"
          loading={statsLoading}
        />
      </div>

      {statsError && (
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {statsError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => handleTabChange('agents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'agents'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} />
          代理列表
        </button>
        <button
          onClick={() => handleTabChange('withdraws')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'withdraws'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Wallet size={16} />
          提现订单
        </button>
      </div>

      {tab === 'agents' ? <AgentsList onStatsChange={fetchStats} /> : <WithdrawOrders onStatsChange={fetchStats} />}
    </div>
  )
}

/* ═══════════════════════════════════════
   StatsCard 组件
   ═══════════════════════════════════════ */

const COLOR_MAP = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200', chart: '#3b82f6' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200', chart: '#22c55e' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200', chart: '#f97316' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-200', chart: '#a855f7' },
} as const

interface StatsCardProps {
  icon: React.ReactNode
  label: string
  value: string
  trend: { value: number; label?: string }[]
  color: keyof typeof COLOR_MAP
  loading: boolean
}

function StatsCard({ icon, label, value, trend, color, loading }: StatsCardProps) {
  const c = COLOR_MAP[color]

  return (
    <div
      className={`${c.bg} ${c.border} border rounded-xl p-4 flex flex-col gap-2 transition`}
    >
      <div className="flex items-center justify-between">
        <div className={`${c.icon}`}>{icon}</div>
        {loading && (
          <div className="w-16 h-4 bg-slate-200 animate-pulse rounded" />
        )}
      </div>
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      {loading ? (
        <div className="w-24 h-6 bg-slate-200 animate-pulse rounded" />
      ) : (
        <span className="text-lg font-bold text-slate-900">{value}</span>
      )}
      <div className="mt-1">
        <MiniChart
          data={trend}
          type="bar"
          width={140}
          height={24}
          color={c.chart}
          gradient={false}
        />
      </div>
    </div>
  )
}
