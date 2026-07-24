/**
 * OverviewCards — 概览统计卡片 + MiniChart 迷你趋势图
 */

import { useMemo } from 'react'
import React from 'react';
import {Activity, Zap, DollarSign, BarChart3, Loader2,
} from 'lucide-react'
import type { VendorStats } from './types'
import { fmtTokens, fmtCost } from './types'

// ── StatCard ──

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: any
}) {
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon size={14} className="text-slate-400" />
      </div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── MiniChart (SVG sparkline) ──

function MiniChart({ data, width = 200, height = 48 }: {
  data: Array<{ date: string; calls: number }>
  width?: number
  height?: number
}) {
  const points = useMemo(() => {
    if (!data || data.length < 2) return null
    const values = data.map(d => d.calls)
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    const stepX = width / (data.length - 1)
    return values.map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${x},${y}`
    }).join(' ')
  }, [data, width, height])

  if (!points) return null

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── 主导出 ──

const OverviewCardsBase = React.memo(function OverviewCardsBase({ stats, loading }: {
  stats: VendorStats | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        暂无统计数据
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="总调用次数"
          value={stats.totalCalls.toLocaleString()}
          icon={Activity}
          color="border-blue-200 bg-blue-50"
        />
        <StatCard
          label="今日调用"
          value={stats.todayCalls.toLocaleString()}
          icon={Zap}
          color="border-purple-200 bg-purple-50"
        />
        <StatCard
          label="总营收"
          value={fmtCost(stats.totalRevenue)}
          icon={DollarSign}
          color="border-green-200 bg-green-50"
        />
        <StatCard
          label="总 Token"
          value={fmtTokens(stats.totalTokens || 0)}
          icon={BarChart3}
          color="border-amber-200 bg-amber-50"
        />
      </div>
      {stats.dailyTrend && stats.dailyTrend.length >= 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">每日调用趋势</h4>
          </div>
          <div className="flex justify-center">
            <MiniChart data={stats.dailyTrend} />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
            <span>{stats.dailyTrend[0]?.date}</span>
            <span>{stats.dailyTrend[stats.dailyTrend.length - 1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  )
})

export default OverviewCardsBase;
