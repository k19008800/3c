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
  teamId: number | null
  teamRole: string | null
  emailVerifiedAt: string | null
  createdAt: string | null
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: UserProfile
}

export interface ModelVendorItem {
  vendorId: number
  vendorName: string
  vendorStatus: string
  inputPrice: string
  outputPrice: string
  weight: number
  status: boolean
}

export interface ModelItem {
  id: number
  name: string
  displayName: string | null
  type: string
  vendors: ModelVendorItem[]
}

export interface ApiKey {
  id: number
  name: string
  key: string
  keyPrefix: string
  status: boolean
  lastUsedAt?: string
  createdAt: string
}

export interface LogItem {
  id: number
  traceId: string
  modelId: number
  modelName: string
  vendorName: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  status: string
  durationMs: number
  createdAt: string
  errorMessage?: string
}

export interface LogSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: number
}

export interface RechargeOrder {
  id: number
  orderNo: string
  userId: number
  amount: number
  channel: string
  status: string
  createdAt: string
  paidAt?: string
  remark?: string
  bankName?: string
  accountNumber?: string
  transferDate?: string
}

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
  teamId: number | null
  createdAt: string
  updatedAt?: string
  stats?: {
    totalRecharge: string
    orderCount: number
    apiKeyCount: number
  }
}

export interface AdminConfig {
  key: string
  value: string
  description?: string
  updatedAt?: string
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

export interface AdminDashboardStats {
  users: {
    total: number
    todayNew: number
    yesterdayNew: number
  }
  calls: {
    today: {
      total: number
      success: number
      failed: number
      timeout: number
      totalTokens: number
      totalCost: string
      avgDuration: number
    }
    yesterday: {
      total: number
      success: number
      totalTokens: number
      totalCost: string
    }
  }
  revenue: {
    todayRecharge: string
    todayRechargeCount: number
    pendingRecharge: string
    pendingRechargeCount: number
  }
  pendingRealName: number
  topModels: Array<{ modelName: string; total: number; totalTokens: number }>
}

export interface Vendor {
  id: number
  name: string
  baseUrl: string
  status: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface AdminModel {
  id: number
  name: string
  displayName?: string
  type: string
  status: boolean
  createdAt: string
  updatedAt: string
}

export interface VendorModel {
  id: number
  vendorId: number
  modelId: number
  vendorName?: string
  modelName?: string
  upstreamModelName: string
  apiEndpoint: string
  costPriceInput: string
  costPriceOutput: string
  sellPriceInput: string
  sellPriceOutput: string
  weight: number
  rpmLimit?: number
  tpmLimit?: number
  status: boolean
  isDown?: boolean
  healthScore?: string
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: number
  userId: number
  email?: string
  nickname?: string
  commissionRate: string
  totalCommission: string
  pendingWithdraw: string
  status: boolean
  createdAt: string
}

export interface WithdrawOrder {
  id: number
  agentId: number
  userId: number
  email?: string
  nickname?: string
  amount: string
  status: string
  rejectReason?: string
  createdAt: string
  reviewedAt?: string
}

export interface AuditLog {
  id: number
  userId?: number
  email?: string
  action: string
  target: string
  targetId?: number
  detail?: string
  ip?: string
  createdAt: string
}

// ── Agent Console ──

export interface AgentClient {
  clientUserId: number
  email: string
  nickname: string | null
  userType: string
  status: string
  balance: string
  boundAt: string
  totalCallCost: string
  totalCommission: string
  commissionCount: number
}

export interface AgentClientDetail {
  agent: {
    id: number
    userId: number
    email: string | null
    nickname: string | null
    commissionRate: string
    totalCommission: string
    pendingWithdraw: string
    status: boolean
  }
  list: AgentClient[]
  total: number
  page: number
  pageSize: number
}

export interface AgentDashboard {
  totalClients: number
  totalCommission: string
  settledCommission: string
  withdrawnTotal: string
  pendingWithdrawTotal: string
  frozenAmount: string
  availableBalance: string
  commissionRate: string
  status: boolean
  recentCommissions: Array<{
    id: number
    callCost: string
    commissionAmount: string
    status: string
    createdAt: string
  }>
}

export interface AgentCommission {
  id: number
  callCost: string
  commissionAmount: string
  status: string
  createdAt: string
  settledAt: string | null
}

export interface AgentWithdrawOrder {
  id: number
  voucherNo: string | null
  amount: string
  feeAmount: string
  actualAmount: string
  bankCardNo: string | null
  bankName: string | null
  bankVoucherUrl: string | null
  wechatPayNo: string | null
  status: string
  auditLevel: number | null
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
  paidAt: string | null
}

export interface ReferralLink {
  referralCode: string
  referralLink: string
}

// ── Dashboard Health ──

// ── Admin User Detail Extra (from 2nd wave) ──

export interface LoginHistoryRecord {
  id: number
  userId: number
  ip: string
  userAgent: string | null
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
}

export interface UserCallStats {
  summary: UserCallStatsSummary
  byModel: UserCallStatsByModel[]
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

export interface OAuthBinding {
  id: number
  provider: string
  providerUserId: string
  providerEmail: string | null
  nickname: string | null
  avatarUrl: string | null
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

export interface UserDataExport {
  exportedAt: string
  user: Record<string, any>
  stats: { totalCalls: number; totalTokens: number; totalCost: string }
  apiKeys: any[]
  balanceLogs: any[]
  oauthBindings: any[]
  adminNotes: any[]
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

// ── Finance (admin) ──

export interface FinanceDashboard {
  pendingFirstReview: { count: number; totalAmount: string }
  pendingSecondReview: { count: number; totalAmount: string }
  pendingRecharge: { count: number; totalAmount: string }
  todayPaidWithdraws: { count: number; totalAmount: string }
  pendingCommissions?: { count: number; totalAmount: string }
}

export interface CommissionRecord {
  id: number
  agentId: number
  agentEmail: string | null
  agentNickname: string | null
  callCost: string
  commissionAmount: string
  commissionType: string
  commissionTypeLabel: string
  feeAmount: string
  netAmount: string
  status: string
  voucherNo: string | null
  sourceOrderId: number | null
  sourceCustomerId: number | null
  createdAt: string
  settledAt: string | null
}

export interface ReconciliationReport {
  date: string
  commission: { count: number; totalCommission: string; totalFee: string; totalNet: string }
  withdraw: { count: number; totalAmount: string; totalFee: string; totalActual: string }
  recharge: { count: number; totalAmount: string }
}

export interface WithdrawRecord {
  id: number
  agentId: number
  userId: number
  email: string | null
  nickname: string | null
  voucherNo: string | null
  amount: string
  feeAmount: string
  actualAmount: string
  bankCardNo: string | null
  bankName: string | null
  bankVoucherUrl: string | null
  status: string
  auditLevel: number | null
  rejectReason: string | null
  firstAuditorId: number | null
  firstAuditedAt: string | null
  secondAuditorId: number | null
  secondAuditedAt: string | null
  paidOperatorId: number | null
  createdAt: string
  reviewedAt: string | null
  paidAt: string | null
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

// ── API Key call stats ──

export interface ApiKeyCallStatsSummary extends UserCallStatsSummary {
  lastUsedAt: string | null
}

export interface ApiKeyCallStats {
  summary: ApiKeyCallStatsSummary
  byModel: UserCallStatsByModel[]
}

// ── API Key call log item ──

export interface AdminCallLogItem {
  id: number
  modelName: string | null
  vendorName: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: string
  durationMs: number | null
  status: string
  isStreaming: boolean
  errorMessage: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

// ── API Key call trend point (simpler shape) ──

export interface ApiKeyTrendPoint {
  date: string
  calls: number
  tokens: number
  cost: string
  avgDuration: number
}

export interface ApiKeyCallTrends {
  days: number
  series: ApiKeyTrendPoint[]
}

export interface ImpersonateResult {
  accessToken: string
  expiresIn: number
  userId: number
  role: string
  warning: string
}

export interface DashboardHealth {
  system: {
    uptime: number
    db: boolean
    redis: boolean
    timestamp: string
  }
  vendors: {
    statusDistribution: Record<string, number>
    avgHealthScore: string
    totalActiveModels: number
    downModelCount: number
    unhealthyModels: Array<{
      vendorName: string
      modelName: string
      upstreamModelName: string
      healthScore: string
      isDown: boolean
      consecutiveSuccess: number | null
      lastCheckAgo: number | null
      samples: number | null
    }>
    recovering: Array<{
      vendorName: string
      modelName: string
      upstreamModelName: string
      consecutiveSuccess: number | null
      healthScore: string
    }>
  }
  rateLimit: {
    globalRpm: { current: number; limit: number }
    globalTpm: { current: number; limit: number }
  }
  recentFailures: {
    oneHourAgo: string
    total: number
    failed: number
    timeout: number
    cancelled: number
    errorRate: number
    topErrors: Array<{
      modelName: string
      errorMessage: string
      count: number
    }>
  }
}

// ── 安全风控（V4.0） ──

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

export interface ActiveSession {
  id: number
  ip: string
  userAgent: string | null
  city: string | null
  isCurrent: boolean
  lastActivity: string
  createdAt: string
}

export interface SecurityLoginResponse {
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  user?: UserProfile
  captchaRequired: boolean
  captchaSession?: string
}

export interface AdminSecurityStats {
  unacknowledgedHighRisk: number
  activeCircuits: number
  bannedIps: number
  bannedUsers: number
}

export interface UserSecurityInfo {
  loginHistory: LoginHistoryItem[]
  securityEvents: SecurityEvent[]
  activeSessions: ActiveSession[]
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
