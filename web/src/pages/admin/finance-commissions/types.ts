// ── Finance Commissions Types ──

import type { CommissionRecord, CommissionRollupRow } from '@/types'

export interface CommissionFilters {
  page: number
  pageSize: number
  agentId?: string
  startDate?: string
  endDate?: string
  status?: string
  commissionType?: string
}

export interface CommissionStats {
  totalCommission: number
  settledCommission: number
  pendingCommission: number
  totalRecords: number
  pendingCount: number
  settledCount: number
}

export interface CommissionFormData {
  settlementAmount: number
  settlementDate: string
  notes: string
  referenceNumber: string
}

export interface CommissionAdjustment {
  commissionId: number
  amount: number
  reason: string
  notes?: string
}

export interface ExportOptions {
  format: 'csv' | 'excel'
  includeAllColumns: boolean
  includeSettledOnly: boolean
}

export interface BatchSettleRequest {
  commissionIds: number[]
  settlementDate: string
  referenceNumber?: string
}

export interface CommissionDetail extends CommissionRollupRow {
  transactions: CommissionRecord[]
  settlementHistory: {
    date: string
    amount: number
    referenceNumber: string
    operator: string
  }[]
  adjustmentHistory: CommissionAdjustment[]
}