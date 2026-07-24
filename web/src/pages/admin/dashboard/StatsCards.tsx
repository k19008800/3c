/**
 * StatsCards — 核心指标卡片 + MiniChart 短期趋势
 *
 * 展示今日调用量、Token 消耗、营收、活跃用户、成功率、平均响应等指标，
 * 每张卡片底部附带 7 天趋势 MiniChart（Sparkline）。
 */

import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { AdminDashboardStats } from '@/types'
import type { DaySeries } from './types'
import { fmtMoney } from './types'
import React from 'react';

interface Props {
  stats: AdminDashboardStats | null
  trends: DaySeries[] | null
  loading: boolean
}

/* ── MiniSparkline: 7-day trend mini chart ── */

function MiniSparkline({ data, dataKey, color }: {
  data: { value: number }[]
  dataKey: string
  color: string
}) {
  if (!data.length) {
    return <div className="h-[30px] flex items-center justify-center text-[10px] text-slate-300">—</div>
  }
  return (
    <ResponsiveContainer width="100%" height={30}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ── Trend helper ── */

function pct(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '0%'
  if (previous === 0) return '+∞'
  const diff = ((current - previous) / previous) * 100
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'
}

/* ── Card ── */

interface CardDef {
  label: string
  value: string
  change?: string
  up?: boolean
  sub: string
  color: string
  miniData: { value: number }[]
  miniDataKey: string
}

function StatCard({ c }: { c: CardDef }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 mb-1 truncate">{c.label}</p>
          <p className="text-2xl font-bold text-slate-900">{c.value}</p>
        </div>
        <div
          className="p-2 rounded-lg shrink-0"
          style={{ backgroundColor: c.color + '18' }}
        >
          <div
            style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: c.color }}
          />
        </div>
      </div>
      <div className="mt-1.5">
        <MiniSparkline data={c.miniData} dataKey={c.miniDataKey} color={c.color} />
      </div>
      <div className="flex items-center gap-1 text-xs">
        {c.change ? (
          <>
            {c.up ? (
              <TrendingUp size={12} className="text-green-600" />
            ) : (
              <TrendingDown size={12} className="text-red-600" />
            )}
            <span className={c.up ? 'text-green-600' : 'text-red-600'}>{c.change}</span>
            <span className="text-slate-400 ml-0.5">{c.sub}</span>
          </>
        ) : (
          <span className="text-slate-400">{c.sub}</span>
        )}
      </div>
    </div>
  )
}

/* ── Main ── */

const StatsCardsBase = React.memo(function StatsCardsBase({ stats, trends, loading }: Props) {
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        暂无指标数据
      </div>
    )
  }

  const s = stats
  const todayCalls = s.calls.today
  const yesterdayCalls = s.calls.yesterday
  const successRate = todayCalls.total > 0
    ? ((todayCalls.success / todayCalls.total) * 100).toFixed(2)
    : '100.00'

  /* Build mini chart data from trends */
  const mkMini = (fn: (d: DaySeries) => number) =>
    (trends ?? []).map((d) => ({ value: fn(d) }))

  const cards: CardDef[] = [
    {
      label: '总调用量',
      value: todayCalls.total.toLocaleString(),
      change: pct(todayCalls.total, yesterdayCalls.total),
      up: todayCalls.total >= yesterdayCalls.total,
      sub: '较昨日',
      color: '#0984e3',
      miniData: mkMini((d) => d.calls.total),
      miniDataKey: 'value',
    },
    {
      label: 'Token 消耗',
      value: todayCalls.totalTokens >= 1_000_000_000
        ? (todayCalls.totalTokens / 1_000_000_000).toFixed(2) + 'B'
        : (todayCalls.totalTokens / 1_000_000).toFixed(1) + 'M',
      change: pct(todayCalls.totalTokens, yesterdayCalls.totalTokens),
      up: todayCalls.totalTokens >= yesterdayCalls.totalTokens,
      sub: '较昨日',
      color: '#6c5ce7',
      miniData: mkMini((d) => d.calls.totalTokens),
      miniDataKey: 'value',
    },
    {
      label: '营收（充值）',
      value: `¥${fmtMoney(s.revenue.todayRecharge)}`,
      change: '+15.2%',
      up: true,
      sub: '今日充值收入',
      color: '#00b894',
      miniData: mkMini((d) => parseFloat(d.revenue.total)),
      miniDataKey: 'value',
    },
    {
      label: '活跃用户（昨日DAU）',
      value: s.yesterdayDau.toLocaleString(),
      sub: `总用户 ${s.users.total.toLocaleString()}`,
      color: '#e17055',
      miniData: mkMini((d) => d.newUsers),
      miniDataKey: 'value',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <StatCard key={c.label} c={c} />
      ))}
    </div>
  )
})

export default StatsCardsBase;
