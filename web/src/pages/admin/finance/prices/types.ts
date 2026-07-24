// ── Prices Types ──

export interface PriceListResponse {
  list: VendorModelRow[]
  multiplier: number
  total: number
}

export interface VendorModelRow {
  id: number
  vendorId: number
  modelId: number
  modelName: string
  vendorName?: string
  upstreamModelName?: string
  sellPriceInput: string
  sellPriceOutput: string
  costPriceInput: string
  costPriceOutput: string
  status: boolean
  updatedAt: string
}

export interface PriceHistoryRow {
  id: number
  modelName: string
  action: string
  oldValue: string | null
  newValue: string | null
  reason: string | null
  operator: string
  createdAt: string
}

// ── Helpers ──

export function fmtPrice(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return isNaN(n) ? '0.00' : n.toFixed(6)
}

export function calcMultiplier(sell: string | number, cost: string | number): number | null {
  const s = typeof sell === 'string' ? parseFloat(sell) : sell
  const c = typeof cost === 'string' ? parseFloat(cost) : cost
  if (!c || c === 0 || isNaN(s) || isNaN(c)) return null
  return s / c
}