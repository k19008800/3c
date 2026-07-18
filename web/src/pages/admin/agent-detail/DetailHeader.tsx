// ═══════════════════════════════════════════════════
//  DetailHeader — 页头信息 + 统计卡片 + MiniChart 趋势
// ═══════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import { ArrowLeft, RefreshCw, DollarSign, Wallet, Banknote, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { get } from '@/lib/api'
import MiniChart from '@/components/ui/MiniChart'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'
import FeatureDescription from '@/components/admin/FeatureDescription'
import type { Agent, AgentIncomeTrendData } from '@/types'

/* ═══════════════════════════════════════════════════
   Stat card
   ═══════════════════════════════════════════════════ */

interface StatCardItem {
  label: string
  value: string
  icon: React.ReactNode
  trend?: string
  trendUp?: boolean
  color: string
}

function StatCard({ label, value, icon, trend, trendUp, color }: StatCardItem) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-lg font-bold text-slate-900 truncate">{value}</p>
        {trend !== undefined && (
          <p
            className={`text-xs mt-1 ${
              trendUp ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {trendUp ? '↑' : '↓'} {trend}
          </p>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Stat cards section
   ═══════════════════════════════════════════════════ */

interface StatCardsProps {
  agent: Agent
  clientCount?: number
}

function StatCards({ agent, clientCount }: StatCardsProps) {
  const cards: StatCardItem[] = useMemo(
    () => [
      {
        label: '总佣金',
        value: `¥${Number(agent.totalCommission || 0).toFixed(2)}`,
        icon: <DollarSign size={18} className="text-blue-600" />,
        color: 'bg-blue-50',
      },
      {
        label: '待提现',
        value: `¥${Number(agent.pendingWithdraw || 0).toFixed(2)}`,
        icon: <Wallet size={18} className="text-orange-600" />,
        color: 'bg-orange-50',
      },
      {
        label: '可提现',
        value: `¥${Number(agent.availableBalance || 0).toFixed(2)}`,
        icon: <Banknote size={18} className="text-green-600" />,
        color: 'bg-green-50',
      },
      {
        label: '客户数',
        value: clientCount !== undefined ? String(clientCount) : '-',
        icon: <Users size={18} className="text-purple-600" />,
        color: 'bg-purple-50',
      },
    ],
    [agent, clientCount]
  )

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Trend chart section
   ═══════════════════════════════════════════════════ */

interface TrendChartSectionProps {
  agentId: number
}

function TrendChartSection({ agentId }: TrendChartSectionProps) {
  const [trendData, setTrendData] = useState<MiniChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    get<AgentIncomeTrendData>(`/api/v1/admin/agents/${agentId}/income-trend`)
      .then((res) => {
        if (cancelled) return
        const points = (res?.trend || []).map((t) => ({
          value: Number(t.totalAmount || 0),
          label: t.date,
        }))
        setTrendData(points)
      })
      .catch(() => {
        // silently fail — endpoint might not exist yet
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [agentId])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-700">收入趋势</span>
        <span className="text-xs text-slate-400">近30天</span>
      </div>
      <MiniChart
        data={trendData}
        loading={loading}
        width={280}
        height={48}
        color="#3b82f6"
        gradient
        type="line"
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Main header component
   ═══════════════════════════════════════════════════ */

interface DetailHeaderProps {
  agent: Agent
  onRefresh: () => void
  clientCount?: number
}

export default function DetailHeader({
  agent,
  onRefresh,
  clientCount,
}: DetailHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/agents')}
            className="p-1.5 rounded-lg hover:bg-slate-200 transition"
          >
            <ArrowLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">代理商详情</h1>
            <FeatureDescription page="admin/agents/detail" className="ml-2" />
            <p className="text-sm text-slate-500 mt-0.5">
              #{agent.id} · {agent.nickname || '-'} · {agent.email || '-'}
              {' · '}
              总佣金 ¥{Number(agent.totalCommission || 0).toFixed(2)}
              {' · '}
              待提现 ¥{Number(agent.pendingWithdraw || 0).toFixed(2)}
              {' · 可提现 ¥'}
              {Number(agent.availableBalance || 0).toFixed(2)}
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* Stat cards */}
      <StatCards agent={agent} clientCount={clientCount} />

      {/* Trend chart */}
      <TrendChartSection agentId={agent.id} />
    </div>
  )
}
