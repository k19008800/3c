// ── 用户相关 ──

import type { SecurityEvent, ActiveSession } from './security'

export interface AdminUser {
  id: number
  email: string
  nickname: string | null
  phone: string | null
  avatarUrl: string | null
  balance: string
  role: string
  status: string
  userType: string
  discountRate: string | null
  rpmOverride: number | null
  tpmOverride: number | null
  realNameStatus: string | null
  realName: string | null
  companyName: string | null
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  disabledUntil: string | null
  disabledReason: string | null
  createdAt: string
  updatedAt?: string
  isBanned?: boolean
  rejectReason?: string | null
  idNumber?: string | null
  stats?: {
    totalRecharge: string
    orderCount: number
    apiKeyCount: number
  }
}

export interface RealNameRecord {
  id: number
  userId: number
  email: string
  realName: string
  idNumber: string
  idCardFront?: string
  idCardBack?: string
  status: string
  rejectReason?: string
  createdAt: string
}

export interface RealNameReviewRecord {
  id: number
  userId: number
  email: string
  nickname: string | null
  userType: string
  version: number
  realName: string | null
  idNumber: string | null
  idFrontImage: string | null
  idBackImage: string | null
  companyName: string | null
  companyRegNumber: string | null
  businessLicense: string | null
  bankName: string | null
  bankAccount: string | null
  bankAddress: string | null
  invoiceTitle: string | null
  invoiceTaxId: string | null
  status: string
  reviewerId: number | null
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
  ocrResult?: any
}

export interface UserRealNameHistoryRecord {
  id: number
  userId: number
  version: number
  realName: string | null
  idNumber: string | null
  idFrontImage: string | null
  idBackImage: string | null
  companyName: string | null
  companyRegNumber: string | null
  businessLicense: string | null
  bankName: string | null
  bankAccount: string | null
  bankAddress: string | null
  invoiceTitle: string | null
  invoiceTaxId: string | null
  status: string
  reviewerId: number | null
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface LoginHistoryRecord {
  id: number
  userId: number
  ip: string
  userAgent: string | null
  success: boolean
  failReason: string | null
  createdAt: string
}

export interface LoginHistoryItem {
  id: number
  ip: string
  userAgent: string | null
  city: string | null
  country: string | null
  success: boolean
  failReason: string | null
  createdAt: string
}

export interface UserNote {
  id: number
  content: string
  createdBy: number
  createdAt: string
  updatedAt: string
}

export interface UserIpWhitelistEntry {
  id: number
  userId: number
  ip: string
  description: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UserCallStatsSummary {
  totalCalls: number
  totalTokens: number
  totalCost: string
  successCalls: number
  failedCalls: number
  avgDuration: number
}

export interface UserCallStatsByModel {
  modelName: string
  calls: number
  tokens: number
  cost: string
  successCount?: number
  failedCount?: number
}

export interface UserCallStatsToday {
  calls: number
  tokens: number
  cost: string
  successCount: number
  failedCount: number
}

export interface UserCallStatsByKey {
  apiKeyId: number
  calls: number
  tokens: number
  cost: string
}

export interface UserCallStatsTrendPoint {
  date: string
  calls: number
  tokens: number
  cost: string
}

export interface UserCallStatsHourlyPoint {
  hour: number
  calls: number
  tokens: number
}

export interface UserCallStats {
  summary: UserCallStatsSummary
  today: UserCallStatsToday
  byModel: UserCallStatsByModel[]
  byKey: UserCallStatsByKey[]
  trends: UserCallStatsTrendPoint[]
  hourly: UserCallStatsHourlyPoint[]
}

// ── Call Trends (user-level + api-key-level) ──

export interface TrendCallPoint {
  total: number
  success: number
  failed: number
  successRate: number
}

export interface TrendTokensPoint {
  total: number
  prompt: number
  completion: number
}

export interface TrendPoint {
  date: string
  calls: TrendCallPoint
  tokens: TrendTokensPoint
  cost: string
  avgDuration: number
}

export interface UserCallTrends {
  days: number
  series: TrendPoint[]
}

export interface UserDataExport {
  exportedAt: string
  user: Record<string, any>
  stats: { totalCalls: number; totalTokens: number; totalCost: string }
  apiKeys: any[]
  balanceLogs: any[]
  oauthBindings: any[]
  adminNotes: any[]
}

export interface ImpersonateResult {
  accessToken: string
  expiresIn: number
  userId: number
  role: string
  warning: string
}

export interface BalanceLogRecord {
  id: number
  userId: number
  amount: string
  balanceAfter: string
  type: string
  refType: string | null
  description: string | null
  createdAt: string
}

export interface AuditLogRecord {
  id: number
  action: string
  operatorId: number | null
  before: any
  after: any
  description: string | null
  ip: string | null
  createdAt: string
}

export interface RoleHistoryRecord {
  id: number
  userId: number
  oldRole: string | null
  newRole: string
  operatorId: number
  reason: string | null
  createdAt: string
}

export interface OAuthBinding {
  id: number
  provider: string
  providerUserId: string
  providerEmail: string | null
  nickname: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface UserSecurityInfo {
  loginHistory: LoginHistoryItem[]
  securityEvents: SecurityEvent[]
  activeSessions: ActiveSession[]
}
