// Redemption 模块类型定义

export interface RedemptionLog {
  id: number
  amount: string
  createdAt: string
  code: string
  batchName: string | null
}

export interface RedemptionLogsData {
  list: RedemptionLog[]
  total: number
  page: number
  pageSize: number
}

export interface UserCode {
  id: number
  code: string
  amount: string
  balance: string
  status: string
  createdAt: string
  batchId: number
  batchName: string | null
  usedByEmail?: string | null
  usedAt?: string | null
}

export interface CodeUsageEvent {
  id: number
  action: string
  email: string | null
  amount: string
  balanceAfter: string
  createdAt: string
  description: string | null
}

export interface CodeDetail {
  code: UserCode
  timeline: CodeUsageEvent[]
}

export interface GiftRecord {
  id: number
  code: string
  amount: string
  fromEmail: string
  toEmail: string
  message: string | null
  status: string
  createdAt: string
}

export interface GiftHistoryData {
  sent: GiftRecord[]
  received: GiftRecord[]
}

export interface PendingBenefit {
  id: number
  code: string
  amount: string
  description: string
  createdAt: string
}

export interface ActivityItem {
  id: number
  name: string
  description: string | null
  status: string
  startAt: string | null
  endAt: string | null
}

export type RedemptionTab = 'redeem' | 'codes' | 'gifts' | 'pending' | 'activities'