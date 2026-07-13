// ── 日志相关 ──

export interface LogItem {
  id: number
  modelName: string | null
  vendorName: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: string
  durationMs: number | null
  status: string
  isStreaming: boolean
  errorMessage: string | null
  requestIp: string | null
  createdAt: string
  // 以下为扩展字段（GeoIP 富化）
  geoCity?: string
  geoCountry?: string
  isProxy?: boolean
}

export interface LogSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: number
  avgDuration: number
  successRate: number
}

export interface LogTrendPoint {
  date: string
  calls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
}

export interface LogTrends {
  days: number
  series: LogTrendPoint[]
}

export interface AdminCallLogItem {
  id: number
  modelName: string | null
  vendorName: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: string
  durationMs: number | null
  status: string
  isStreaming: boolean
  errorMessage: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface LogAnomalies {
  avgDailyCost: string
  avgCostPerCall: string
  costThreshold: string
  anomalies: DailyAnomaly[]
  expensiveCalls: ExpensiveCall[]
}

export interface DailyAnomaly {
  date: string
  totalCost: string
  totalCalls: number
  maxSingleCost: string
  reason: string
}

export interface ExpensiveCall {
  id: number
  modelName: string | null
  cost: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  durationMs: number | null
  createdAt: string
}
