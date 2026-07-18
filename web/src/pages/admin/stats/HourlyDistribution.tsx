import { useMemo } from 'react'
import { Clock, Activity } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { HourlyItem } from './types'
import { fmtTokens } from './types'
import { TokenTooltip } from './Tooltips'

interface HourlyDistributionProps {
  data: HourlyItem[]
}

/** 24-hour heatmap grid */
function HourlyHeatmap({ data }: { data: HourlyItem[] }) {
  const maxCalls = useMemo(() => Math.max(1, ...data.map(h => h.totalCalls)), [data])
  const hours = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const found = data.find(h => h.hour === i)
      return found || { hour: i, totalCalls: 0, totalTokens: 0, successCalls: 0, totalCost: '0', avgDuration: 0 }
    }),
  [data])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-xs font-medium text-slate-500 mb-3">
        <Clock size={12} className="inline mr-1 text-indigo-500" />
        24 小时调用分布（今日）
      </h4>
      {data.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <div
          className="grid gap-px bg-slate-100 rounded-lg overflow-hidden"
          style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
        >
          {hours.map(h => {
            const intensity = maxCalls > 0 ? h.totalCalls / maxCalls : 0
            let bg = 'bg-slate-50'
            if (intensity > 0.7) bg = 'bg-blue-500'
            else if (intensity > 0.4) bg = 'bg-blue-400'
            else if (intensity > 0.1) bg = 'bg-blue-200'
            return (
              <div
                key={h.hour}
                className={`${bg} p-2 text-center transition-colors`}
                title={`${h.hour}:00 - ${h.totalCalls}次 / ${fmtTokens(h.totalTokens)}`}
              >
                <span className={intensity > 0.4 ? 'text-white text-[9px] font-mono' : 'text-[9px] text-slate-600 font-mono'}>
                  {h.hour}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Hourly line chart */
function HourlyLineChart({ data }: { data: HourlyItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-xs font-medium text-slate-500 mb-3">
        <Activity size={12} className="inline mr-1 text-indigo-500" />
        按小时调用趋势
      </h4>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }}
                tickFormatter={(h: number) => `${h}:00`} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false}
                tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
              <Tooltip content={<TokenTooltip />} />
              <Line type="monotone" dataKey="totalCalls" stroke="#6366F1" strokeWidth={2}
                dot={false} name="调用次数" />
              <Line type="monotone" dataKey="totalTokens" stroke="#8B5CF6" strokeWidth={2}
                dot={false} name="Token" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ──── Main ────

export default function HourlyDistribution({ data }: HourlyDistributionProps) {
  return (
    <>
      <HourlyHeatmap data={data} />
      <HourlyLineChart data={data} />
    </>
  )
}
