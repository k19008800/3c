import { useState, useCallback } from 'react'
import type { DaySeries, MetricKey, ChartStyle } from '../types'

export function useOverviewTrends(series: DaySeries[]) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('calls')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line')
  const [showCompare, setShowCompare] = useState(false)

  const getChartData = useCallback(() => {
    return series.map((s) => ({
      date: s.date,
      calls: s.calls.total,
      tokens: s.calls.totalTokens,
      cost: parseFloat(s.calls.totalCost || '0'),
      revenue: s.revenue ? parseFloat(s.revenue.total) : 0,
      duration: s.calls.avgDuration,
      successRate: s.calls.successRate,
    }))
  }, [series])

  return {
    activeMetric,
    setActiveMetric,
    chartStyle,
    setChartStyle,
    showCompare,
    setShowCompare,
    getChartData,
  }
}