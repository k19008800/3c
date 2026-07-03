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
  requestIp: string | null
  createdAt: string
  // 以下为扩展字段（GeoIP 富化�?
  geoCity?: string
  geoCountry?: string
  isProxy?: boolean
}

export interface LogSummary {
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: number
  avgDuration: number
  successRate: number
}

export interface LogTrendPoint {
  date: string
  calls: number
  successCalls: number
  failedCalls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
}

export interface LogTrends {
  days: number
  series: LogTrendPoint[]
}

export interface ModelStatsItem {
  modelName: string | null
  calls: number
  totalTokens: number
  totalCost: string
  avgDuration: number
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
  /** 双审字段 */
  firstConfirmedBy?: number | null
  firstConfirmedAt?: string | null
  secondConfirmedBy?: number | null
  secondConfirmedAt?: string | null
  voucherNo?: string | null
  confirmedBy?: number | null
  confirmedAt?: string | null
  channelOrderNo?: string | null
  voucherImage?: string | null
  expiresAt?: string | null
  userEmail?: string
  userNickname?: string | null
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
  isBanned?: boolean
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
  totalCommission: string
  settledCommission?: string
  pendingWithdraw: string
  frozenAmount?: string
  availableBalance?: string
  parentAgentId?: number | null
  status: boolean
  createdAt: string
  updatedAt?: string
}

export interface CommissionRule {
  id: number
  agentId: number
  ruleType: 'sale' | 'renewal' | 'team' | 'activity'
  rate: string
  isEnabled: boolean
  minTriggerAmount: string | null
  maxCap: string | null
  validFrom: string | null
  validUntil: string | null
  activityName: string | null
  activityType: string | null
  fixedAmount: string | null
  teamLevelLimit: number | null
  createdBy: number
  createdAt: string
  updatedAt: string
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
  status: boolean
  commissionRate: string
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
  commissionType: string | null
  commissionTypeLabel: string
  voucherNo: string | null
  sourceOrderId: string | null
  sourceOrderAmount: string | null
  feeRate: string | null
  feeAmount: string
  netAmount: string
  calcDetail: any
  ruleSnapshot: any
  status: string
  customerName: string | null
  customerEmail: string | null
  sourceCustomerId?: number | null
  createdAt: string
  settledAt: string | null
}

export interface AgentCommissionSummary {
  totalCommission: string
  monthCommission: string
  monthCount: number
  pendingAmount: string
  pendingCount: number
  settledAmount: string
  settledCount: number
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

export interface NotificationItem {
  id: number
  title: string
  content: string
  type: string
  readAt: string | null
  createdAt: string
}

export interface ReferralLink {
  referralCode: string
  referralLink: string
}

// ── Team ──

export interface TeamMemberInfo {
  id: number
  userId: number
  email: string
  nickname: string | null
  role: string
  quotaBalance: string | null
  invitedAt: string | null
  joinedAt: string
}

export interface TeamInfo {
  teamId: number
  members: TeamMemberInfo[]
  memberCount: number
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

export interface CommissionRollupRow {
  id: number
  agentId: number
  agentEmail: string | null
  agentNickname: string | null
  reportDate: string
  totalRecords: number
  totalCallCost: string
  totalCommissionAmount: string
  totalFeeAmount: string
  totalNetAmount: string
  pendingCount: number
  settledCount: number
  cancelledCount: number
  pendingAmount: string
  settledAmount: string
  saleCount: number
  renewalCount: number
  activityCount: number
  saleAmount: string
  renewalAmount: string
  activityAmount: string
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
  startDate: string
  endDate: string
  granularity: 'day' | 'week' | 'month'
  // 汇总卡�?
  summary: {
    commission: { count: number; totalCommission: string; totalFee: string; totalNet: string }
    withdraw: { count: number; totalAmount: string; totalFee: string; totalActual: string }
    recharge: { count: number; totalAmount: string }
  }
  // 维度拆分
  dimensions: {
    byAgent: ReconDimensionItem[]
    byStatus: Record<string, ReconDimensionItem>
    byCommissionType: ReconDimensionItem[]
  }
  // 资金平衡校验
  balanceCheck: ReconBalanceCheck
  // 可疑记录
  anomalies: ReconAnomalyItem[]
  // 趋势数据
  trends: ReconTrendPoint[]
}

export interface ReconDimensionItem {
  label: string
  count: number
  totalAmount: string
  feeAmount?: string
  netAmount?: string
}

export interface ReconBalanceCheck {
  totalIncome: string      // 总收入（充值确认）
  totalExpense: string     // 总支出（扣费�?
  totalCommission: string  // 总佣金支�?
  totalWithdraw: string    // 总提现支�?
  platformProfit: string   // 平台利润
  diff: string             // 差额（应�?0�?
  isBalanced: boolean      // 是否平账
}

export interface ReconAnomalyItem {
  id: number
  type: 'orphan_commission' | 'amount_anomaly' | 'frequent_withdraw' | 'unmatched_recharge'
  severity: 'low' | 'medium' | 'high'
  description: string
  relatedId: number | null
  amount: string | null
  createdAt: string
}

export interface ReconTrendPoint {
  date: string
  commissionAmount: string
  commissionCount: number
  withdrawAmount: string
  withdrawCount: number
  rechargeAmount: string
  rechargeCount: number
}

export interface ReconQueryParams {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month'
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

// ── Enhanced Admin Dashboard Stats (include new fields from enhanced /stats) ──

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
  security: {
    unacknowledgedHighRisk: number
    activeCircuits: number
    bannedIps: number
    bannedUsers: number
  }
  // 新增增强字段
  realNameFunnel: Record<string, number>
  agents: {
    total: number
    active: number
    totalCommission: string
    pendingWithdraw: string
  }
  system: {
    activeVendors: number
    downVendors: number
  }
  yesterdayDau: number
  lowBalanceUsers: number
  todayAvgDuration: number
  todayErrorRate: number
  platformBalance: string
}

export interface RevenueAnalysis {
  today: {
    byType: Array<{
      type: string
      cost: string
      tokens: number
      count: number
      models: string[]
    }>
    byChannel: Array<{
      channel: string
      total: string
      count: number
    }>
  }
  month: {
    startDate: string
    revenue: string
    cost: string
    profitRate: number
    revenueTrend: Array<{
      date: string
      total: string
      count: number
    }>
  }
}

export interface TopConsumer {
  userId: number
  email: string
  nickname: string | null
  userType: string
  companyName: string | null
  totalConsumption: string
  totalCalls: number
  monthConsumption: string
  balance: string
}

export interface TopConsumersData {
  topConsumers: TopConsumer[]
  lowBalanceUsers: Array<{
    id: number
    email: string
    nickname: string | null
    balance: string
    userType: string
  }>
  lowBalanceCount: number
}

export interface TodoQueue {
  realNamePending: number
  bankTransfer: {
    pending: { count: number; totalAmount: string }
    needFirstReview: { count: number; totalAmount: string }
    needSecondReview: { count: number; totalAmount: string }
  }
  withdraws: {
    needFirstReview: { count: number; totalAmount: string }
    needSecondReview: { count: number; totalAmount: string }
  }
  unacknowledgedSecurityEvents: number
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

// ── 安全风控（V4.0�?──

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

// ── Log Anomalies (Phase 3) ──

export interface DailyAnomaly {
  date: string
  totalCost: string
  totalCalls: number
  maxSingleCost: string
  reason: string
}

export interface ExpensiveCall {
  id: number
  modelName: string | null
  cost: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  durationMs: number | null
  createdAt: string
}

export interface LogAnomalies {
  avgDailyCost: string
  avgCostPerCall: string
  costThreshold: string
  anomalies: DailyAnomaly[]
  expensiveCalls: ExpensiveCall[]
}
