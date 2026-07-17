/**
 * RevenueChart — 收入趋势图
 *
 * 展示本月每日营收柱状图 + 月营收/月成本/毛利率汇总。
 */

import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Loader2 } from 'lucide-react'
import type { RevenueAnalysis } from '@/types'

interface Props {
  revenue: RevenueAnalysis | null
  loading: boolean
}

export default function RevenueChart({ revenue, loading }: Props) {
  /* ── Loading ── */
  if (loading && !revenue) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">收入趋势</h3>
        </div>
        <div className="h-[200px] flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      </div>
    )
  }

  const chartData = revenue?.month.revenueTrend?.map((r) => ({
    date: r.date.slice(5),
    revenue: parseFloat(r.total),
  })) ?? []

  const hasData = chartData.length > 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">成本 vs 售价（本月）</h3>
      </div>
      <div className="p-5">
        {!hasData ? (
          <div className="h-[150px] flex items-center justify-center text-sm text-slate-400">
            暂无数据
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="revenue" fill="#0984e3" radius={[3, 3, 0, 0]} name="日营收" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-xs text-slate-500 mt-3">
              <span>
                月营收 ¥
                {parseFloat(revenue!.month.revenue).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span>
                月成本 ¥
                {parseFloat(revenue!.month.cost).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="text-emerald-600 font-semibold">
                毛利率 {revenue!.month.profitRate}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
