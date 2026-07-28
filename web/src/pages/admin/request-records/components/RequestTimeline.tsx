/**
 * RequestTimeline — 请求时间线
 *
 * Recharts BarChart 按日/时聚合，可切换粒度（日/时）。
 */

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface TimelinePoint {
  /** 日期（YYYY-MM-DD）或小时（0-23） */
  label: string
  count: number
}

interface RequestTimelineProps {
  /** 按日聚合数据 */
  dailyData: Array<{ date: string; count: number }>
  /** 按小时聚合数据 */
  hourlyData: Array<{ hour: number; count: number }>
  loading?: boolean
}

type Granularity = 'day' | 'hour'

export default function RequestTimeline({ dailyData, hourlyData, loading }: RequestTimelineProps) {
  const [granularity, setGranularity] = useState<Granularity>('day')

  const chartData: TimelinePoint[] = useMemo(() => {
    if (granularity === 'day') {
      return (dailyData || []).map((d) => ({
        label: d.date.slice(5), // MM-DD
        count: d.count,
      }))
    }
    // hour
    return Array.from({ length: 24 }, (_, i) => {
      const found = (hourlyData || []).find((h) => h.hour === i)
      return {
        label: `${String(i).padStart(2, '0')}:00`,
        count: found?.count || 0,
      }
    })
  }, [granularity, dailyData, hourlyData])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-slate-700">请求时间线</p>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setGranularity('day')}
            className={`px-3 py-1 text-xs rounded-md transition ${
              granularity === 'day'
                ? 'bg-white text-slate-800 shadow-sm font-medium'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            按日
          </button>
          <button
            onClick={() => setGranularity('hour')}
            className={`px-3 py-1 text-xs rounded-md transition ${
              granularity === 'hour'
                ? 'bg-white text-slate-800 shadow-sm font-medium'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            按小时
          </button>
        </div>
      </div>
      <div className="h-64">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="请求数" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            暂无数据
          </div>
        )}
      </div>
    </div>
  )
}