export interface RedemptionCode {
  id: number
  code: string
  amount: string
  status: string
  createdAt: string
  batchId: number
  batchName: string | null
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

export interface CodeTemplate {
  id: number
  name: string
  type: string
  tokenAmount: string
  validDays: number | null
  maxPerUser: number
  userScope: string
  remark: string | null
  createdByType: string
  createdById: number
  createdAt: string
}

export interface CostAnalysisData {
  summary: {
    totalBatches: number
    totalFaceValue: number
    totalUsedToken: number
    totalCost: number
    totalSubsidy: number
    overallUsageRate: number
    lockedAmount: number
  }
  batches: {
    batchId: number
    batchName: string
    totalCount: number
    usedCount: number
    usageRate: number
    faceValue: number
    costAmount: number
    subsidy: number
    status: string
  }[]
}

export const codeStatusMap: Record<string, { label: string; color: string }> = {
  unused: { label: '未使用', color: 'bg-blue-100 text-blue-700' },
  used: { label: '已使用', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-slate-100 text-slate-500' },
  revoked: { label: '已作废', color: 'bg-red-100 text-red-700' },
  disabled: { label: '已停用', color: 'bg-orange-100 text-orange-700' },
}

export interface AgentWallet {
  settledCommission: string
  pendingWithdraw: string
  frozenAmount: string
  redemptionLocked: string
  available: string
}

export function downloadCsvFromData(csv: string, filename: string) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
