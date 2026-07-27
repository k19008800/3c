// ── 代理商 ──

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
  // 3.1 代理等级
  level: 'preparatory' | 'primary' | 'advanced' | 'sub'
  auditStatus: 'pending' | 'approved' | 'rejected'
  auditRemark: string | null
  auditedBy: number | null
  auditedAt: string | null
  // 提现限制
  withdrawCooldownHours: number
  withdrawFreezeDays: number
  // 高级代理
  accountManager: string | null
  prioritySupport: boolean
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
    commissionRate?: string
  }
  list: AgentClient[]
  total: number
  page: number
  pageSize: number
}

export interface AgentDashboard {
  totalClients: number
  newClientsThisMonth: number       // 3.3 本月新增客户
  totalCommission: string
  settledCommission: string
  withdrawnTotal: string
  pendingWithdrawTotal: string
  frozenAmount: string
  availableBalance: string
  status: boolean
  commissionRate: string
  // 3.3 新增KPI
  monthTotalConsumption: string      // 本月总消费
  monthCommissionIncome: string      // 本月佣金收入
  pendingSettlement: string          // 待结算金额
  agentLevel: string                 // 代理等级
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

export interface ReferralLink {
  referralCode: string
  referralLink: string
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

export interface AgentOverviewItem {
  agentId: number
  agentName: string
  issuedCount: number
  usedCount: number
  frozenTokens: string
  usageRate: number
  riskLevel: 'low' | 'medium' | 'high'
}

export interface AgentCodeDetail {
  agentId: number
  agentName: string
  codes: RedemptionCodeItem[]
}

export interface RedemptionCodeItem {
  id: number
  code: string
  amount: string
  status: string
  batchId: number
  batchName: string | null
  createdAt: string
}

export interface AgentIncomeTrendData {
  trend: Array<{
    date: string
    totalAmount: string
    settledAmount: string
  }>
  summary: {
    totalIncome: string
    avgDailyIncome: string
    growthRate: number
    totalDays: number
    dailyGrowthRate: number
  }
}

export interface AgentIncomeStructureData {
  byType: Array<{
    type: string
    label: string
    amount: string
    count: number
    percentage: number
  }>
  topClients: Array<{
    customerUserId: number
    customerName: string
    customerEmail: string
    totalAmount: string
    commissionAmount: string
    orderCount: number
    lastOrderAt: string | null
  }>
  monthIncome: string
  monthRecords: number
}
