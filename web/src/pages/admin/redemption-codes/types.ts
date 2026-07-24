// RedemptionCodes 类型定义

export interface RedemptionStats {
  totalBatches: number
  activeBatches: number
  totalCodes: number
  usedCodes: number
  unusedCodes: number
  revokedCodes: number
  totalValue: number
  usedValue: number
  unusedValue: number
}

export interface RedemptionBatch {
  id: number
  name: string
  codeCount: number
  usedCount: number
  valuePerCode: string
  totalValue: string
  status: 'active' | 'inactive' | 'revoked'
  expiresAt: string | null
  createdAt: string
  createdBy: string
  agentId?: number
  agentName?: string
  description?: string
}

export interface RedemptionCode {
  id: number
  code: string
  batchId: number
  batchName: string
  value: string
  status: 'unused' | 'used' | 'revoked'
  usedBy?: number
  usedByEmail?: string
  usedAt?: string
  expiresAt?: string
  createdAt: string
}

export interface AdminRedemptionLog {
  id: number
  action: string
  batchId?: number
  batchName?: string
  codeId?: number
  code?: string
  userId?: number
  userEmail?: string
  agentId?: number
  agentName?: string
  details?: string
  createdAt: string
}

export interface FraudStats {
  totalEvents: number
  highSeverity: number
  mediumSeverity: number
  lowSeverity: number
  bannedIps: number
  topOffenders: { ip: string; count: number }[]
}

export interface FraudEvent {
  id: number
  eventType: string
  ip: string
  userId?: number
  userEmail?: string
  codeId?: number
  code?: string
  severity: 'high' | 'medium' | 'low'
  details?: string
  createdAt: string
}

export interface BannedIp {
  ip: string
  reason: string
  bannedAt: string
  expiresAt?: string
}

export interface AgentOverviewItem {
  agentId: number
  agentName: string
  agentEmail: string
  totalBatches: number
  totalCodes: number
  usedCodes: number
  unusedCodes: number
  totalValue: string
  usedValue: string
}

export type TabKey = 'stats' | 'batches' | 'codes' | 'logs' | 'fraud' | 'agentOverview' | 'agentDetail' | 'auditLogs' | 'reports'
