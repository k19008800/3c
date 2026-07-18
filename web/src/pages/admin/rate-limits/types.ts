// ── Shared types for RateLimits module ──

export interface RateLimitRule {
  key: string
  label: string
  value: string
  isDefault: boolean
}

export interface WaterLevels {
  globalRpm: { current: number; limit: number }
  globalTpm: { current: number; limit: number }
  userRpmTotal: { current: number; label: string }
  userTpmTotal: { current: number; label: string }
  activeUsersInWindow: number
  activeKeysInWindow: number
  totalKeyRpm: number
}

export interface OverrideItem {
  quotaId: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  userType: string | null
  rpmLimit: number | null
  tpmLimit: number | null
  currentRpm: number
  currentTpm: number
  periodStart: string | null
  periodEnd: string | null
  setByRole: string | null
  updatedAt: string | null
}

export interface HitItem {
  id: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  modelName: string | null
  errorMessage: string | null
  requestTokens: string | null
  createdAt: string | null
}

export type TabKey = 'rules' | 'overrides' | 'hits'
export type HitsRange = '1h' | '6h' | 'today'

// ── 分组标签 ──

export const GROUP_MAP: Record<string, string> = {
  rate_limit_personal_rpm: '个人用户',
  rate_limit_personal_tpm: '个人用户',
  rate_limit_enterprise_rpm: '企业用户',
  rate_limit_enterprise_tpm: '企业用户',
  rate_limit_global_rpm: '全局兜底',
  rate_limit_global_tpm: '全局兜底',
}

export function groupKey(key: string): string {
  return GROUP_MAP[key] || '其他'
}
