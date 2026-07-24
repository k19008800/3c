import { useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { CommissionRollupRow, PaginatedData } from '@/types'

export function useFinanceCommissions() {
  const [rows, setRows] = useState<CommissionRollupRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCommissions = useCallback(async (params: {
    page: number
    pageSize: number
    agentId?: string
    startDate?: string
    endDate?: string
    status?: string
    commissionType?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<PaginatedData<CommissionRollupRow>>(
        '/api/v1/admin/finance/commissions',
        params
      )
      setRows(res.list || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const settleCommission = useCallback(async (id: number): Promise<boolean> => {
    try {
      await post(`/api/v1/admin/finance/commissions/${id}/settle`)
      return true
    } catch (err: any) {
      setError(err.message || '结算失败')
      return false
    }
  }, [])

  return {
    rows,
    total,
    loading,
    error,
    fetchCommissions,
    settleCommission,
  }
}