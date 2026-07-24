import type { Vendor } from '@/types'

export interface KeyGroup {
  id: number
  vendorId: number
  name: string
  strategy: string
  description: string | null
  status: boolean
  keyCount: number
  activeCount: number
  downCount: number
  disabledCount: number
  createdAt: string
  updatedAt: string
}

export interface KeyItem {
  id: number
  groupId: number
  apiKeyPrefix: string | null
  apiKeyEncrypted?: string
  weight: number
  priority: number
  status: boolean
  isDown: boolean
  consecutiveFailures: number
  totalCalls: number
  successCalls: number
  sellPriceInput: string | null
  sellPriceOutput: string | null
  costPriceInput: string | null
  costPriceOutput: string | null
  notes: string | null
  deletedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface ChannelRef {
  id: number
  vendorId: number
  vendorName: string
  modelId: number
  modelName: string
  upstreamModelName: string
  status: boolean
  isDown: boolean
}

export interface TestResult {
  itemId: number
  success: boolean
  durationMs: number
  statusCode?: number
  error?: string
}

export interface VendorSummary {
  vendorId: number
  vendorName: string
  groupCount: number
  keyCount: number
}

export type StatusTab = 'all' | 'active' | 'down' | 'disabled' | 'deleted'

export interface HealthStatus {
  level: 'healthy' | 'warn' | 'danger'
  rate: number | null
  label?: string
  color?: string
  bgColor?: string
}