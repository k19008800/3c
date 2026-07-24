import { TrendingUp, RefreshCw, CalendarDays, Loader2 } from 'lucide-react'
import { TrendChart, MetricSelector } from '../overview-trends/components'
import { useOverviewTrends } from '../overview-trends/hooks'
import type { OverviewTrendsProps } from '../overview-trends/types'

export default function OverviewTrends({
  series,
  days,
  onDaysChange,
  loading,
  onRefresh,
}: OverviewTrendsProps) {
  const {
    activeMetric,
    setActiveMetric,
    chartStyle,
    setChartStyle,
    getChartData,
  } = useOverviewTrends(series)

  const chartData = getChartData()

  const DAYS_OPTIONS = [7, 14, 30, 60]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h3 className="text-lg font-semibold">趋势概览</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Days selector */}
          <div className="flex items-center gap-1">
            <CalendarDays size={16} className="text-slate-400" />
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={`px-2 py-1 text-xs border rounded ${
                  days === d
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'hover:bg-slate-50'
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 border rounded hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Metric & Style Selector */}
      <MetricSelector
        activeMetric={activeMetric}
        onMetricChange={setActiveMetric}
        chartStyle={chartStyle}
        onStyleChange={setChartStyle}
      />

      {/* Chart */}
      <div className="bg-white rounded-xl border p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : series.length === 0 ? (
          <div className="text-center text-slate-500 h-64 flex items-center justify-center">
            暂无数据
          </div>
        ) : (
          <TrendChart
            data={chartData}
            metric={activeMetric}
            chartStyle={chartStyle}
            color=""
          />
        )}
      </div>

      {/* Summary */}
      {series.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-3">
            <div className="text-xs text-slate-600">总调用</div>
            <div className="text-lg font-bold">
              {series.reduce((sum, s) => sum + s.calls.total, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="text-xs text-slate-600">总Token</div>
            <div className="text-lg font-bold">
              {(series.reduce((sum, s) => sum + s.calls.totalTokens, 0) / 1_000_000).toFixed(2)}M
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="text-xs text-slate-600">总成本</div>
            <div className="text-lg font-bold">
              ¥{series.reduce((sum, s) => sum + parseFloat(s.calls.totalCost || '0'), 0).toFixed(2)}
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="text-xs text-slate-600">平均成功率</div>
            <div className="text-lg font-bold">
              {(series.reduce((sum, s) => sum + s.calls.successRate, 0) / series.length).toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}