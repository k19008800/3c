/**
 * VendorSelfMgmt — 共享类型与工具函数
 */

// ── API 数据类型 ──

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

export type ActiveTab = 'info' | 'models' | 'stats' | 'health'

// ── 工具函数 ──

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

export function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

export function parseCost(v: string): number {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── StatusBadge 组件 ──

export function StatusBadge({ status }: { status: string | boolean }) {
  const isActive = status === true || status === 'active'
  const isPending = status === 'pending'
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${
      isActive ? 'bg-green-100 text-green-700 border-green-200' :
      isPending ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
      'bg-red-100 text-red-700 border-red-200'
    }`}>{isActive ? '已激活' : isPending ? '待审核' : '已禁用'}</span>
  )
}
