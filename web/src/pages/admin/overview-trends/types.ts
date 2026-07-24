// ── Overview Trends Types ──

export interface DaySeries {
  date: string
  calls: {
    total: number
    success: number
    failed: number
    timeout: number
    successRate: number
    totalTokens: number
    totalCost: string
    avgDuration: number
  }
  newUsers: number
  revenue?: { count: number; total: string }
}

export interface HourEntry {
  hour: number
  total: number
  success: number
  failed: number
  timedout: number
  totalTokens: number
  totalCost: string
}

export interface HourlyData {
  date: string
  total: number
  hours: HourEntry[]
  topModels: { modelName: string; total: number; totalTokens: number }[]
  peakHour: { hour: number; total: number; topModels: { modelName: string; total: number }[] }
}

export interface CompareData {
  days: number
  currentLabel: string
  previousLabel: string
  merged: { date: string; current: DaySeries; previous: DaySeries | null; diff: { calls: number; callsPct: string | null } }[]
  summary: { currentTotal: number; previousTotal: number; currentTokens: number; previousTokens: number; currentCost: number; previousCost: number }
}

export type MetricKey = 'calls' | 'tokens' | 'cost' | 'revenue' | 'duration' | 'successRate'
export type ChartStyle = 'line' | 'bar' | 'area'

// ── Props 接口（保持与 Dashboard 兼容）─

export interface OverviewTrendsProps {
  series: DaySeries[]
  days: number
  onDaysChange: (days: number) => void
  loading: boolean
  onRefresh: () => void
}