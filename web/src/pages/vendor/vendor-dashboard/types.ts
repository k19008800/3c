export interface VendorInfo {
  id: number; name: string; baseUrl: string; status: string
  description: string | null; companyName: string | null
  contactName: string | null; contactPhone: string | null; contactEmail: string | null
  createdAt: string; vendorKeyPrefix: string | null; vendorKeyActive: boolean | null
}

export interface VendorModelInfo {
  id: number; modelId: number; modelName: string; upstreamModelName: string
  apiEndpoint: string; costPriceInput: string; costPriceOutput: string
  sellPriceInput: string; sellPriceOutput: string; weight: number; status: boolean
  rpmLimit: number | null; tpmLimit: number | null
  healthScore: string | number | null; isDown: boolean; circuitState: string
  circuitFailCount: number; createdAt: string
}

export interface VendorStats {
  totalCalls: number; todayCalls: number; totalRevenue: string
  totalTokens?: number; successRate?: number; avgDuration?: number
  modelStats: Array<{ modelName: string; calls: number; totalTokens: number; revenue: string }>
  dailyTrend?: Array<{ date: string; calls: number; tokens: number }>
  hourlyTrend?: Array<{ hour: number; calls: number }>
}

export interface VendorHealthItem {
  vendorModelId: number; modelName: string; upstreamModelName: string
  status: boolean; healthScore: number | string | null
  healthSamples: number | null; consecutiveSuccess: number | null
  lastHealthCheckAt: string | null; isDown: boolean
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

export function fmtCost(n: string | number): string {
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '¥0'
  if (v < 0.01) return `¥${v.toFixed(6)}`
  return `¥${v.toFixed(2)}`
}


