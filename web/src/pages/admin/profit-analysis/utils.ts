// ProfitAnalysis 工具函数

import type { ProfitSummary, ModelProfitRow, LowMarginModel } from './types'

/** 格式化金额 */
export function fmtMoney(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return `¥${num.toFixed(2)}`
}

/** 格式化百分比 */
export function fmtPercent(value: number): string {
  if (isNaN(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}

/** 格式化数字 */
export function fmtNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

/** 计算利润率 */
export function calcMarginRate(revenue: number, cost: number): number {
  if (revenue === 0) return 0
  return (revenue - cost) / revenue
}

/** 获取变化趋势图标 */
export function getTrendIcon(change: number): 'up' | 'down' | 'flat' {
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return 'flat'
}

/** 获取变化颜色 */
export function getTrendColor(change: number): string {
  if (change > 0) return 'text-green-600'
  if (change < 0) return 'text-red-600'
  return 'text-slate-500'
}

/** 筛选低利润率模型 */
export function filterLowMargin(models: ModelProfitRow[], threshold: number = 0.1): LowMarginModel[] {
  return models
    .filter(m => m.marginRate < threshold)
    .map(m => ({
      modelName: m.modelName,
      revenue: m.revenue,
      cost: m.cost,
      profit: m.profit,
      marginRate: m.marginRate,
      lossAmount: m.profit < 0 ? Math.abs(m.profit) : 0,
    }))
    .sort((a, b) => a.marginRate - b.marginRate)
}

/** 导出 CSV */
export function exportProfitCSV(data: ModelProfitRow[], filename: string = 'profit-analysis.csv'): void {
  const headers = ['模型名称', '调用次数', '收入', '成本', '利润', '利润率']
  const rows = data.map(m => [
    m.modelName,
    m.totalCalls,
    m.revenue.toFixed(2),
    m.cost.toFixed(2),
    m.profit.toFixed(2),
    `${(m.marginRate * 100).toFixed(1)}%`,
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
