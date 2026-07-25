import { useState, useCallback } from 'react'
import { post } from '@/lib/api'
import type { CommissionRollupRow } from '@/types'

interface UseCommissionActionsOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useCommissionActions(options?: UseCommissionActionsOptions) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const settleCommission = useCallback(async (commissionId: number, data?: any): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      await post(`/api/v1/admin/finance/commissions/${commissionId}/settle`, data || {})
      options?.onSuccess?.()
      return true
    } catch (err: any) {
      const errorMsg = err.message || '结算失败'
      setError(errorMsg)
      options?.onError?.(errorMsg)
      return false
    } finally {
      setLoading(false)
    }
  }, [options])

  const batchSettleCommissions = useCallback(async (commissionIds: number[]): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      await post('/api/v1/admin/finance/commissions/batch-settle', { commissionIds })
      options?.onSuccess?.()
      return true
    } catch (err: any) {
      const errorMsg = err.message || '批量结算失败'
      setError(errorMsg)
      options?.onError?.(errorMsg)
      return false
    } finally {
      setLoading(false)
    }
  }, [options])

  const adjustCommission = useCallback(async (commissionId: number, adjustmentData: {
    amount: number
    reason: string
    notes?: string
  }): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      await post(`/api/v1/admin/finance/commissions/${commissionId}/adjust`, adjustmentData)
      options?.onSuccess?.()
      return true
    } catch (err: any) {
      const errorMsg = err.message || '调整失败'
      setError(errorMsg)
      options?.onError?.(errorMsg)
      return false
    } finally {
      setLoading(false)
    }
  }, [options])

  const exportCommissions = useCallback(async (filters: any): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await post('/api/v1/admin/finance/commissions/export', filters)
      return response.url || response.downloadUrl
    } catch (err: any) {
      const errorMsg = err.message || '导出失败'
      setError(errorMsg)
      options?.onError?.(errorMsg)
      return null
    } finally {
      setLoading(false)
    }
  }, [options])

  const getCommissionDetail = useCallback(async (commissionId: number): Promise<any | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await post(`/api/v1/admin/finance/commissions/${commissionId}/detail`)
      return response
    } catch (err: any) {
      const errorMsg = err.message || '获取详情失败'
      setError(errorMsg)
      options?.onError?.(errorMsg)
      return null
    } finally {
      setLoading(false)
    }
  }, [options])

  const refreshCommission = useCallback(async (commission: CommissionRollupRow): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      await post(`/api/v1/admin/finance/commissions/${commission.agentId}/refresh`, {
        date: commission.reportDate,
      })
      options?.onSuccess?.()
      return true
    } catch (err: any) {
      const errorMsg = err.message || '刷新失败'
      setError(errorMsg)
      options?.onError?.(errorMsg)
      return false
    } finally {
      setLoading(false)
    }
  }, [options])

  return {
    loading,
    error,
    settleCommission,
    batchSettleCommissions,
    adjustCommission,
    exportCommissions,
    getCommissionDetail,
    refreshCommission,
    clearError: () => setError(null),
  }
}