import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TrendItem } from './types'

interface TrendChartProps {
  data: TrendItem[]
}

/** 7-day trend area chart (used in Trends tab) */
export default function TrendChart({ data }: TrendChartProps) {
  const last7 = useMemo(() => data.slice(-7), [data])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-xs font-medium text-slate-500 mb-3">
        <TrendingUp size={12} className="inline mr-1 text-blue-500" />
        最近 7 天趋势
      </h4>
      {data.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-sm text-slate-400">暂无趋势数据</div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last7}>
              <defs>
                <linearGradient id="colorTrendTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTrendCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis yAxisId="tokens" tick={{ fontSize: 11 }} tickLine={false}
                tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
              <YAxis yAxisId="calls" orientation="right" tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip />
              <Area yAxisId="tokens" type="monotone" dataKey="totalTokens" stroke="#8B5CF6"
                fill="url(#colorTrendTokens)" name="Token" strokeWidth={2} />
              <Area yAxisId="calls" type="monotone" dataKey="totalCalls" stroke="#3B82F6"
                fill="url(#colorTrendCalls)" name="调用次数" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
