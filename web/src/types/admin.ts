// ── 管理后台 ──

export interface AdminConfig {
  key: string
  value: string
  description?: string
  updatedAt?: string
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
  security: {
    unacknowledgedHighRisk: number
    activeCircuits: number
    bannedIps: number
    bannedUsers: number
  }
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
  agentAuditPending: number
  pendingAnnouncements: number
}

// ── 操作类型管理 ──

export interface OperationType {
  id: number
  name: string
  category: string
  description: string | null
  enabled: boolean
  isSystem: boolean
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

export interface OperationTypeCategory {
  label: string
  color: string
}

export interface OperationTypeStats {
  total: number
  enabled: number
  disabled: number
  system: number
  byCategory: Array<{
    category: string
    label: string
    total: number
    enabled: number
    disabled: number
  }>
}

// ── 运营 KPI ──

export interface OperationalKpiData {
  // 日活跃
  dau: number
  dauChange: number
  dauAlert: boolean
  // 日调用
  dailyCalls: number
  callChange: number
  callGrowthAlert: boolean
  // 月流水
  mrr: number
  mrrChange: number
  mrrAlert: boolean
  // 毛利率
  grossMargin: number
  marginAlert: boolean
  // 留存率
  retentionRate7: string
  retentionRate30: string
  // 代理活跃度
  agentActiveRate: number
  // Key 使用率
  keyUsageRate: number
  // 供应商健康度
  vendorHealth: Array<{
    vendorName: string
    availability: number
    status: "healthy" | "warning" | "critical"
  }>
  // 告警收敛率
  convergenceRate: string
  // 自助结算率
  selfSettleRate: string
  // ARPU
  arpu: number
  // 总用户
  totalUsers: number
  updatedAt: string
}

export interface UserTierInfo {
  name: string
  key: string
  definition: string
  count: number
  percentage: number
  totalSpend: number
  avgSpend: number
  strategy: string
}

export interface UserTierData {
  tiers: UserTierInfo[]
  totalUsers: number
  updatedAt: string
}

export interface KpiTrendItem {
  date: string
  calls: number
  dau: number
  tokens: number
  cost: number
}

export interface KpiTrendData {
  series: KpiTrendItem[]
  updatedAt: string
}
