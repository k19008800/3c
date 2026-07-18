import { memo, useMemo } from 'react'
import { Loader2, DollarSign, TrendingUp, Clock, CheckCircle2 } from 'lucide-react'
import type { AgentCommissionSummary } from '@/types'
import { fmt2 } from './types'
import type { SummaryCardItem } from './types'

// ── Mini sparkline chart (inlined SVG) ──

const MiniChart = memo(function MiniChart({ data, color }: { data?: number[]; color: string }) {
  if (!data || data.length < 2) return null
  const w = 80
  const h = 28
  const max = Math.max(...data) || 1
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  )
})

// ── Props ──

interface Props {
  summary: AgentCommissionSummary | null
  loading: boolean
}

// ── Component ──

function CommissionStatsCards({ summary, loading }: Props) {
  const cards: SummaryCardItem[] = useMemo(() => [
    {
      label: '累计佣金',
      value: summary ? `¥${fmt2(summary.totalCommission)}` : '-',
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: '本月佣金',
      value: summary ? `¥${fmt2(summary.monthCommission)}` : '-',
      sub: summary ? `${summary.monthCount} 笔` : '',
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '待结算',
      value: summary ? `¥${fmt2(summary.pendingAmount)}` : '-',
      sub: summary ? `${summary.pendingCount} 笔` : '',
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: '已结算',
      value: summary ? `¥${fmt2(summary.settledAmount)}` : '-',
      sub: summary ? `${summary.settledCount} 笔` : '',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ], [summary])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${card.bg}`}>
              {loading ? (
                <Loader2 size={20} className={`animate-spin ${card.color}`} />
              ) : (
                <card.icon size={20} className={card.color} />
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              {card.sub && <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default memo(CommissionStatsCards)
