// ── 安全相关 ──

export interface SecurityConfig {
  key: string
  value: any
  description: string
  updatedAt: string | null
}

export interface SecurityEvent {
  id: number
  userId: number | null
  eventType: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ip: string
  userAgent: string | null
  city: string | null
  country: string | null
  detail: any
  acknowledged: boolean
  acknowledgedBy: number | null
  acknowledgedAt: string | null
  createdAt: string
}

export interface CircuitBreakerStatus {
  vendorModelId: number
  vendorId: number
  vendorName: string
  upstreamModelName: string
  state: 'closed' | 'open' | 'half-open'
  failuresSinceTrip: number
  openedAt: number | null
  lastFailAt: number | null
}

export interface SecurityLoginResponse {
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  user?: import('./base').UserProfile
  captchaRequired: boolean
  captchaSession?: string
}

export interface AdminSecurityStats {
  unacknowledgedHighRisk: number
  activeCircuits: number
  bannedIps: number
  bannedUsers: number
  todayEventCount: number
  weekEventCount: number
}

export interface SecurityDashboardData {
  stats: AdminSecurityStats
  riskDistribution: Array<{ riskLevel: string; count: number }>
  typeDistribution: Array<{ eventType: string; count: number }>
  trend: Array<{
    date: string
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }>
  recentEvents: SecurityEvent[]
}

export interface ActiveSession {
  id: number
  ip: string
  userAgent: string | null
  city: string | null
  isCurrent: boolean
  lastActivity: string
  createdAt: string
}

export interface BanList {
  ipBans: Array<{
    ip: string
    banStart: number
    remainingMs: number
  }>
  userBans: Array<{
    userId: number
    email: string | null
    nickname: string | null
    banStart: number
    banDurationMs: number
    remainingMs: number
  }>
}
