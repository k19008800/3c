import { useState, useCallback } from 'react'
import type { DaySeries, MetricKey, ChartStyle } from '../types'
import { getChartData } from '../utils'

export function useTrendData(series: DaySeries[]) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('calls')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line')
  const [showCompare, setShowCompare] = useState(false)

  const chartData = useCallback(() => {
    return getChartData(series)
  }, [series])

  return {
    activeMetric,
    setActiveMetric,
    chartStyle,
    setChartStyle,
    showCompare,
    setShowCompare,
    chartData,
  }
}