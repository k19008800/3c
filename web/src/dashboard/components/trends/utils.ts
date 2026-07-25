// ── Overview Trends Utils ──

import type { DaySeries, MetricKey } from './types'

/**
 * 格式化时间显示
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/**
 * 提取图表数据
 */
export function getChartData(series: DaySeries[]): Array<Record<string, any>> {
  return series.map((s) => ({
    date: s.date,
    calls: s.calls.total,
    tokens: s.calls.totalTokens,
    cost: parseFloat(s.calls.totalCost || '0'),
    revenue: s.revenue ? parseFloat(s.revenue.total) : 0,
    duration: s.calls.avgDuration,
    successRate: s.calls.successRate,
  }))
}

/**
 * 计算统计信息
 */
export function calculateStats(series: DaySeries[]) {
  if (series.length === 0) {
    return {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      avgSuccessRate: 0,
    }
  }

  const totalCalls = series.reduce((sum, s) => sum + s.calls.total, 0)
  const totalTokens = series.reduce((sum, s) => sum + s.calls.totalTokens, 0)
  const totalCost = series.reduce((sum, s) => sum + parseFloat(s.calls.totalCost || '0'), 0)
  const avgSuccessRate = series.reduce((sum, s) => sum + s.calls.successRate, 0) / series.length

  return {
    totalCalls,
    totalTokens,
    totalCost,
    avgSuccessRate,
  }
}

/**
 * 获取指标颜色
 */
export const METRIC_COLORS: Record<MetricKey, string> = {
  calls: '#0984e3',
  tokens: '#6c5ce7',
  cost: '#e17055',
  revenue: '#00b894',
  duration: '#fdcb6e',
  successRate: '#00cec9',
}

/**
 * 获取指标标签
 */
export const METRIC_LABELS: Record<MetricKey, string> = {
  calls: '调用量',
  tokens: 'Token',
  cost: '成本',
  revenue: '收入',
  duration: '延迟',
  successRate: '成功率',
}

/**
 * 获取图表样式选项
 */
export const CHART_STYLES = [
  { key: 'line' as const, label: '折线' },
  { key: 'area' as const, label: '面积' },
  { key: 'bar' as const, label: '柱状' },
]