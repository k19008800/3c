// ── API Key 相关 ──

import type { UserCallStatsSummary, UserCallStatsByModel } from './user'

// ── 权限配置类型 ──
export interface TimeRestriction {
  startHour?: number
  endHour?: number
  weekdays?: number[]
}

export interface QuotaRestrictions {
  dailyLimit?: number
  monthlyLimit?: number
  perRequestLimit?: number
}

export interface ApiKeyPermissions {
  allowedModels?: string[] | null
  ipWhitelist?: string[] | null
  ipBlacklist?: string[] | null
  allowedEndpoints?: string[] | null
  rateLimitPerMinute?: number | null
  timeRestrictions?: TimeRestriction | null
  quotaRestrictions?: QuotaRestrictions | null
  requireModelCheck?: boolean | null
}

export interface ApiKey {
  id: number
  name: string
  key: string
  keyPrefix: string
  status: boolean
  lastUsedAt?: string
  createdAt: string
  permissions?: ApiKeyPermissions | null
  templateId?: number | null
  quotaBalance?: string | null
  dailyUsage?: number
  monthlyUsage?: number
  expiresAt?: string | null
}

// ── 权限模板类型 ──
export interface PermissionTemplate {
  id: number
  name: string
  description?: string
  permissions: ApiKeyPermissions
  isSystem: boolean
  createdAt: string
  updatedAt: string
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
