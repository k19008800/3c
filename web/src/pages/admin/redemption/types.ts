// ── Shared types for Redemption Codes management ──

export interface AgentOverviewItem {
  agentId: number
  agentName: string
  issuedCount: number
  usedCount: number
  frozenTokens: string
  usageRate: number
  riskLevel: 'low' | 'medium' | 'high'
}

export interface AgentCodeDetailItem {
  id: number
  code: string
  amount: string
  status: string
  usesLeft: number
  usedAt: string | null
  createdAt: string
  batchId: number
  batchName: string | null
}

export interface RedemptionCode {
  id: number
  code: string
  amount: string
  status: string
  usesLeft: number
  usedAt: string | null
  createdAt: string
  batchId: number
  batchName: string | null
}

export interface RedemptionBatch {
  id: number
  name: string
  amount: string
  totalCount: number
  usedCount: number
  maxUses: number
  status: string
  createdAt: string
  expiresAt: string | null
  note: string | null
}

export interface RedemptionStats {
  totalBatches: number
  activeBatches: number
  totalCodes: number
  usedCodes: number
  totalRedeemed: number
  totalAmount: string
  totalUsers: number
}

export interface AdminRedemptionLog {
  id: number
  code: string
  amount: string
  userId: number
  email: string | null
  nickname: string | null
  ip: string | null
  batchId: number
  batchName: string | null
  createdAt: string
}

export interface AuditLogItem {
  id: number
  operatorId: number
  operator: string
  action: string
  targetType: string
  targetId: number | null
  detail: string
  createdAt: string
}

export interface FraudStats {
  todayEvents: number
  unacknowledged: number
  bySeverity: { critical: number; high: number; warning: number }
  byType: Record<string, number>
  bannedIpCount: number
}

export interface FraudEvent {
  id: number
  eventType: string
  ip: string | null
  userId: number | null
  code: string | null
  riskScore: number
  severity: string
  detail: string | null
  acknowledged: boolean
  createdAt: string
}

export interface BannedIp {
  id: number
  ip: string
  reason: string | null
  createdAt: string
}

// ── Status helpers ──

export const codeStatusMap: Record<string, { label: string; color: string }> = {
  unused: { label: '未使用', color: 'bg-blue-100 text-blue-700' },
  used: { label: '已使用', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },
  revoked: { label: '已作废', color: 'bg-red-100 text-red-700' },
  disabled: { label: '已停用', color: 'bg-orange-100 text-orange-700' },
}

export const batchStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '激活', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },
  disabled: { label: '已禁用', color: 'bg-red-100 text-red-700' },
}

export const fraudEventTypeMap: Record<string, string> = {
  brute_force: '爆破检测',
  ip_anomaly: 'IP异常',
  user_frequency: '高频兑换',
  code_leak: '码泄露',
  high_risk_score: '高风险评分',
  manual_ban: '手动封禁',
}

export const fraudSeverityConfig: Record<string, { label: string; color: string }> = {
  warning: { label: '警告', color: 'bg-amber-100 text-amber-700' },
  high: { label: '高危', color: 'bg-orange-100 text-orange-700' },
  critical: { label: '严重', color: 'bg-red-100 text-red-700' },
}

// ── Helper: format datetime-local value from ISO string ──

export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Helper: download CSV from data object ──

export function downloadCsvFromData(data: { csv: string }, filename: string) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + data.csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
