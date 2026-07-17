/**
 * UsageChart — 用量趋势图
 *
 * 展示每日 API 调用量 + Token 消耗趋势（双柱/双轴）。
 */

import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts'
import { Loader2 } from 'lucide-react'
import type { DaySeries } from './types'

interface Props {
  trends: DaySeries[] | null
  loading: boolean
}

export default function UsageChart({ trends, loading }: Props) {
  if (loading && !trends) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">用量趋势</h3>
        </div>
        <div className="h-[200px] flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      </div>
    )
  }

  if (!trends || trends.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">用量趋势</h3>
        </div>
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      </div>
    )
  }

  const chartData = trends.map((d) => ({
    date: d.date.slice(5),
    calls: d.calls.total,
    tokens: Math.round(d.calls.totalTokens / 10000),
    successRate: +d.calls.successRate.toFixed(1),
  }))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">用量趋势</h3>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="left"
              dataKey="calls"
              fill="#0984e3"
              radius={[3, 3, 0, 0]}
              name="调用次数"
            />
            <Bar
              yAxisId="right"
              dataKey="tokens"
              fill="#6c5ce7"
              radius={[3, 3, 0, 0]}
              name="Token (万)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
