// ── 财务相关 ──

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
  summary: {
    commission: { count: number; totalCommission: string; totalFee: string; totalNet: string }
    withdraw: { count: number; totalAmount: string; totalFee: string; totalActual: string }
    recharge: { count: number; totalAmount: string }
  }
  dimensions: {
    byAgent: ReconDimensionItem[]
    byStatus: Record<string, ReconDimensionItem>
    byCommissionType: ReconDimensionItem[]
  }
  balanceCheck: ReconBalanceCheck
  anomalies: ReconAnomalyItem[]
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
  totalIncome: string
  totalExpense: string
  totalCommission: string
  totalWithdraw: string
  platformProfit: string
  diff: string
  isBalanced: boolean
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

export interface CodeCostOverview {
  totalCost: string
  adminCost: string
  agentCost: string
  subsidyAmount: string
  subsidyRatio: number
  adminVsAgent: {
    admin: { cost: string; subsidy: string; revenue: string; netEffect: string }
    agent: { cost: string; subsidy: string; revenue: string; netEffect: string }
  }
}

export interface AgentCostItem {
  agentId: number
  agentName: string
  agentEmail: string | null
  totalFaceValue: string
  costAmount: string
  subsidyAmount: string
  subsidyRate: number
  roi: number
  batches: AgentCostBatch[]
}

export interface AgentCostBatch {
  batchId: number
  batchName: string
  count: number
  usedCount: number
  faceValue: string
  costAmount: string
  subsidyAmount: string
}

export interface AdminCostItem {
    campaignId: number
    campaignName: string
    issuedCount: number
    usedCount: number
    usageRate: number
    totalFaceValue: number
    costAmount: number
    subsidyAmount: number
    budgetAmount: number
    budgetExecutionRate: number
    batches: AdminCostBatch[]
  }

  export interface AdminCostBatch {
    batchId: number
    batchName: string
    count: number
    usedCount: number
    faceValue: number
    costAmount: number
    subsidyAmount: number
  }

  export interface AdminCostDetailResponse {
    period: string
    summary: {
      totalFaceValue: number
      totalCost: number
      totalSubsidy: number
      costExecutionRate: number
      campaignCount: number
    }
    list: AdminCostItem[]
    total: number
    page: number
    pageSize: number
  }

export interface AgentSettlementItem {
  agentId: number
  agentName: string
  email: string
  openingBalance: number
  openingFrozen: number
  monthDeduction: number
  monthFreeze: number
  monthUnfreeze: number
  monthRefund: number
  closingBalance: number
  closingFrozen: number
}

export interface SettlementSummary {
  totalAgents: number
  totalOpeningAvailable: number
  totalOpeningFrozen: number
  totalConsumption: number
  totalFrozen: number
  totalUnfreeze: number
  totalRefund: number
  totalClosingAvailable: number
  totalClosingFrozen: number
}

export interface AgentSettlementResponse {
  period: string
  summary: SettlementSummary
  items: AgentSettlementItem[]
  total: number
  page: number
  pageSize: number
}

export interface FundFlowEntry {
  id: number
  balanceType: string
  changeType: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  refType: string | null
  refId: number | null
  refCodeId: number | null
  remark: string | null
  createdAt: string
}

export interface AgentSettlementDetailResponse {
  period: string
  agentId: number
  agentName: string
  email: string
  openingBalance: number
  monthDeduction: number
  monthFreeze: number
  monthUnfreeze: number
  monthRefund: number
  closingBalance: number
  entries: FundFlowEntry[]
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
