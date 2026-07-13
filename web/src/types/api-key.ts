// ── API Key 相关 ──

import type { UserCallStatsSummary, UserCallStatsByModel } from './user'

export interface ApiKey {
  id: number
  name: string
  key: string
  keyPrefix: string
  status: boolean
  lastUsedAt?: string
  createdAt: string
}

export interface ApiKeyCallStatsSummary extends UserCallStatsSummary {
  lastUsedAt: string | null
}

export interface ApiKeyCallStats {
  summary: ApiKeyCallStatsSummary
  byModel: UserCallStatsByModel[]
}

export interface ApiKeyCallTrends {
  days: number
  series: ApiKeyTrendPoint[]
}

export interface ApiKeyTrendPoint {
  date: string
  calls: number
  tokens: number
  cost: string
  avgDuration: number
}

export interface AdminApiKey {
  id: number
  name: string
  keyPrefix: string
  status: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}
