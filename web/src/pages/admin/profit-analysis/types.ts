// ── Profit Analysis Types ──

export interface ProfitSummary {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  marginRate: number
  revenueChange: number
  costChange: number
  profitChange: number
  marginChange: number
}

export interface ProfitSummaryRow {
  modelId: number
  modelName: string
  totalCalls: number
  totalTokens: number
  totalUserCost: string
  totalCostPrice: string
  grossProfit: string
  totalCommission: string
}

export interface MonthlyTrend {
  month: string
  revenue: number
  cost: number
  profit: number
}

export interface ModelProfitRow {
  modelName: string
  totalCalls: number
  revenue: number
  cost: number
  profit: number
  marginRate: number
}

export interface LowMarginModel {
  modelName: string
  revenue: number
  cost: number
  profit: number
  marginRate: number
  lossAmount: number
}

export interface VendorStat {
  vendorName: string
  totalCalls: number
  totalTokens: number
  totalCost: string | number
  userCount?: number
}

export interface ProfitData {
  summary: ProfitSummary
  trends: MonthlyTrend[]
  models: ModelProfitRow[]
  lowMarginModels: LowMarginModel[]
  total: number
}

// ── Helper functions ──

export function fmt(v: number | string | null | undefined, digits = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  if (isNaN(n)) return '0.00'
  return `￥${n.toFixed(digits)}`
}

export function fmtPct(v: number | null | undefined): string {
  const n = typeof v === 'number' ? v : 0
  return `${(n * 100).toFixed(1)}%`
}

export function fmtNum(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseInt(v) : typeof v === 'number' ? v : 0
  return isNaN(n) ? '0' : n.toLocaleString()
}

export function fmtChange(v: number | null | undefined): string {
  const n = typeof v === 'number' ? v : 0
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(1)}%`
}