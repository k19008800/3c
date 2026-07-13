// ── 模型相关 ──

export interface ModelVendorItem {
  vendorId: number
  vendorName: string
  vendorStatus: string
  inputPrice: string
  outputPrice: string
  weight: number
  status: boolean
}

export interface ModelItem {
  id: number
  name: string
  displayName: string | null
  description: string | null
  type: string
  vendors: ModelVendorItem[]
}

export interface ModelStatsItem {
  modelName: string | null
  calls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
}

export interface Vendor {
  id: number
  name: string
  baseUrl: string
  status: string
  description?: string
  modelCount?: number       // JOIN count: 已接入模型数
  companyName?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  createdAt: string
  updatedAt: string
}

export interface AdminModel {
  id: number
  name: string
  displayName?: string
  description?: string
  type: string
  status: boolean
  createdAt: string
  updatedAt: string
}

export interface VendorModel {
  id: number
  vendorId: number
  modelId: number
  vendorName?: string
  modelName?: string
  modelType?: string        // chat/embedding/image/audio/video/rerank
  upstreamModelName: string
  apiEndpoint: string
  costPriceInput: string
  costPriceOutput: string
  sellPriceInput: string
  sellPriceOutput: string
  weight: number
  rpmLimit?: number
  tpmLimit?: number
  status: boolean
  isDown?: boolean
  healthScore?: string
  circuitState?: string      // closed | open | half_open | dead
  circuitOpenedAt?: string
  circuitRetryAfter?: string
  createdAt: string
  updatedAt: string
}
