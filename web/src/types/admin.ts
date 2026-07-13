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
}
