import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { fmt2, GrowthBadge, TrendTooltip, DATE_RANGES, type TrendChartProps } from './types'

/**
 * 收入趋势曲线图 — 支持 7/30/90 天切换
 *
 * 【状态覆盖】
 *  - loading：居中 spinner
 *  - 空数据：提示文案
 *  - 正常渲染：折线图 + 底部快统计
 */
export default function TrendChart({ data, loading, days, onDaysChange }: TrendChartProps) {
  const chartData = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        date: t.date.slice(5), // MM-DD
        fullDate: t.date,
        总收入: parseFloat(t.totalAmount),
        已结算: parseFloat(t.settledAmount),
      })),
    [data],
  )

  const hasData = chartData.length > 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* ── 表头 + 日期切换 ── */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">收入趋势</h2>
          {data && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                累计:{' '}
                <strong className="text-slate-700">¥{fmt2(data.summary.totalIncome)}</strong>
              </span>
              <span className="hidden sm:inline">
                日均:{' '}
                <strong className="text-slate-700">¥{fmt2(data.summary.avgDailyIncome)}</strong>
              </span>
              <span className="hidden sm:inline">
                增长: <GrowthBadge rate={data.summary.growthRate} />
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => onDaysChange(r.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                days === r.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 图表主体 ── */}
      <div className="px-2 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-52">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : !hasData ? (
          <div className="text-center py-12 text-sm text-slate-400">
            选定时间内暂无收入数据
          </div>
        ) : (
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `¥${v.toFixed(0)}`}
                  width={60}
                />
                <Tooltip content={<TrendTooltip />} />
                <Line
                  type="monotone"
                  dataKey="总收入"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="已结算"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── 底部快速统计 ── */}
      {data && hasData && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-500">
          <div>
            <span className="block">总天数</span>
            <span className="text-sm font-semibold text-slate-700">{data.summary.totalDays}天</span>
          </div>
          <div>
            <span className="block">日均收入</span>
            <span className="text-sm font-semibold text-slate-700">¥{fmt2(data.summary.avgDailyIncome)}</span>
          </div>
          <div>
            <span className="block">增长趋势</span>
            <GrowthBadge rate={data.summary.growthRate} />
          </div>
          <div>
            <span className="block">期末/期初</span>
            <GrowthBadge rate={data.summary.dailyGrowthRate} />
          </div>
        </div>
      )}
    </div>
  )
}
