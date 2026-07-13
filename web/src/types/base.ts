// ── 通用基础类型 ──

export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface UserProfile {
  id: number
  email: string
  nickname: string | null
  userType: 'personal' | 'enterprise'
  role: string
  status: string
  realNameStatus: string | null
  realName?: string | null
  balance: string
  discountRate: string | null
  rpmOverride: number | null
  tpmOverride: number | null
  emailVerifiedAt: string | null
  createdAt: string | null
  /** RBAC permission bitset as decimal string (BigInt). Empty string = not loaded. */
  permissions?: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: UserProfile
}

// ── 审计日志 ──

export interface AuditLog {
  id: number
  operatorId: number
  operatorEmail: string | null
  operatorNickname: string | null
  action: string
  actionLabel: string
  targetType: string
  targetTypeLabel: string
  targetId: number | null
  targetName: string | null
  description: string | null
  ip: string | null
  createdAt: string
}

export interface AuditLogDetail extends AuditLog {
  before: any
  after: any
}

// ── 操作日志 ──

export interface OperationLog {
  id: number
  userId: number
  userEmail: string | null
  userNickname: string | null
  userRole: string
  category: string
  categoryLabel: string
  action: string
  actionLabel: string
  targetType: string | null
  targetId: number | null
  resourceName: string | null
  summary: string | null
  metadata: Record<string, any> | null
  status: string
  errorReason: string | null
  ip: string | null
  createdAt: string
}
