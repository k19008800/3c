import { TrendingUp, Loader2 } from 'lucide-react'
import { TrendChart, TrendFilters, TrendStats, TrendLegend } from './components'
import { useTrendData } from './hooks'
import type { OverviewTrendsProps } from './types'

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
    chartData,
  } = useTrendData(series)

  const data = chartData()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          <h3 className="text-lg font-semibold">趋势概览</h3>
        </div>
        <TrendFilters 
          days={days} 
          onDaysChange={onDaysChange} 
          loading={loading} 
          onRefresh={onRefresh} 
        />
      </div>

      {/* Metric & Style Selector */}
      <TrendLegend
        metric={activeMetric}
        chartStyle={chartStyle}
        onMetricChange={setActiveMetric}
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
            data={data}
            metric={activeMetric}
            chartStyle={chartStyle}
          />
        )}
      </div>

      {/* Summary */}
      <TrendStats series={series} />
    </div>
  )
}