// ── 审计统计卡片 + MiniChart 事件频率趋势 ──

import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import MiniChart from '@/components/ui/MiniChart'
import type { AuditStats } from './types'

interface Props {
  stats: AuditStats | null
  loading: boolean
}

/** 较昨日变化百分比 */
function pct(current: number, previous: number): { text: string; up: boolean } {
  if (previous === 0 && current === 0) return { text: '0%', up: true }
  if (previous === 0) return { text: '+∞', up: true }
  const diff = ((current - previous) / previous) * 100
  return {
    text: (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%',
    up: diff >= 0,
  }
}

/* ── 单张指标卡片 ── */

interface CardDef {
  label: string
  value: string
  sub: string
  up?: boolean
  changeText?: string
}

function StatCard({ c }: { c: CardDef }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{c.label}</p>
      <p className="text-2xl font-bold text-slate-900">{c.value}</p>
      <div className="flex items-center gap-1 mt-1 text-xs">
        {c.changeText != null ? (
          <>
            {c.up ? (
              <TrendingUp size={12} className="text-green-600" />
            ) : (
              <TrendingDown size={12} className="text-red-600" />
            )}
            <span className={c.up ? 'text-green-600' : 'text-red-600'}>{c.changeText}</span>
            <span className="text-slate-400 ml-0.5">{c.sub}</span>
          </>
        ) : (
          <span className="text-slate-400">{c.sub}</span>
        )}
      </div>
    </div>
  )
}

/* ── 趋势迷你图卡片 ── */

function TrendCard({ stats }: { stats: AuditStats }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 col-span-1 sm:col-span-2 lg:col-span-1">
      <p className="text-xs text-slate-500 mb-1">24h 事件频率趋势</p>
      <div className="h-10">
        <MiniChart
          data={stats.trend}
          width={200}
          height={40}
          color="#0984e3"
          type="bar"
        />
      </div>
    </div>
  )
}

/* ── 主组件 ── */

export default function AuditStatsCards({ stats, loading }: Props) {
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        暂无统计信息
      </div>
    )
  }

  const change = pct(stats.totalToday, stats.totalYesterday)

  const cards: CardDef[] = [
    {
      label: '今日事件',
      value: stats.totalToday.toLocaleString(),
      changeText: change.text,
      up: change.up,
      sub: '较昨日',
    },
    {
      label: '操作人数',
      value: stats.uniqueOperators.toLocaleString(),
      sub: '今日去重',
    },
    {
      label: '高频操作',
      value: stats.topAction || '-',
      sub: '今日最常见',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <StatCard key={c.label} c={c} />
      ))}
      <TrendCard stats={stats} />
    </div>
  )
}
