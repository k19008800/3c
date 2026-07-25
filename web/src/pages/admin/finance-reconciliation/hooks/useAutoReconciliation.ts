import { useState, useCallback } from 'react'
import { get, post } from '@/lib/api'

export interface MismatchRecord {
  id: number
  orderId?: number
  refType: string
  refId: number
  mismatchType: string
  expectedValue?: string
  actualValue?: string
  reason: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  resolved: boolean
  resolvedBy?: number
  resolvedAt?: string
  resolutionNote?: string
  createdAt: string
}

export interface ReconciliationReportDetail {
  report: {
    id: number
    startDate: string
    endDate: string
    reconType: 'full' | 'recharge' | 'balance' | 'commission'
    totalOrders: number
    matchedOrders: number
    mismatchedOrders: number
    totalAmount: string
    difference: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    errorMessage?: string
    createdAt: string
    startedAt?: string
    completedAt?: string
  }
  mismatches: MismatchRecord[]
}

export interface RunReconciliationResult {
  reportId: number
  summary: {
    totalOrders: number
    matchedOrders: number
    mismatchedOrders: number
    totalAmount: string
    difference: string
  }
  mismatches: MismatchRecord[]
  status: 'completed' | 'failed'
  errorMessage?: string
}

export function useAutoReconciliation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 执行对账
  const runReconciliation = useCallback(async (params: {
    startDate: string
    endDate: string
    reconType?: 'full' | 'recharge' | 'balance' | 'commission'
  }): Promise<RunReconciliationResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await post<RunReconciliationResult>(
        '/api/v1/admin/finance/reconciliation/run',
        params
      )
      return result
    } catch (err: any) {
      setError(err.message || '对账执行失败')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取报告列表
  const listReports = useCallback(async (params?: {
    page?: number
    pageSize?: number
    reconType?: string
    status?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const result = await get<{
        list: ReconciliationReportDetail['report'][]
        total: number
        page: number
        pageSize: number
      }>('/api/v1/admin/finance/reconciliation/reports', params || {})
      return result
    } catch (err: any) {
      setError(err.message || '获取报告列表失败')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取报告详情
  const getReportDetail = useCallback(async (reportId: number): Promise<ReconciliationReportDetail | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await get<ReconciliationReportDetail>(
        `/api/v1/admin/finance/reconciliation/reports/${reportId}`
      )
      return result
    } catch (err: any) {
      setError(err.message || '获取报告详情失败')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // 标记异常已解决
  const resolveMismatch = useCallback(async (mismatchId: number, note?: string) => {
    setLoading(true)
    setError(null)
    try {
      await post(
        `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/resolve`,
        { note }
      )
      return true
    } catch (err: any) {
      setError(err.message || '标记失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    runReconciliation,
    listReports,
    getReportDetail,
    resolveMismatch,
  }
}
