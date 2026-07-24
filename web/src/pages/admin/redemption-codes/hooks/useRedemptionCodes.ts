// useRedemptionCodes - 兑换码数据管理

import { useState, useCallback } from 'react'
import { get, del, patch, post } from '@/lib/api'
import type { RedemptionCode } from '../types'

interface UseCodesOptions {
  page?: number
  pageSize?: number
  batchId?: number
  status?: string
}

export function useRedemptionCodes(options: UseCodesOptions = {}) {
  const { page = 1, pageSize = 20, batchId, status } = options

  const [codes, setCodes] = useState<RedemptionCode[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCodes = useCallback(async (opts?: Partial<UseCodesOptions>) => {
    setLoading(true)
    setError('')
    try {
      const params: any = {
        page: opts?.page ?? page,
        pageSize: opts?.pageSize ?? pageSize,
      }
      if (opts?.batchId ?? batchId) params.batchId = opts?.batchId ?? batchId
      if (opts?.status ?? status) params.status = opts?.status ?? status

      const data = await get<{ list: RedemptionCode[]; total: number }>(
        '/api/v1/admin/redemption/codes',
        params
      )
      setCodes(data.list || [])
      setTotal(data.total || 0)
    } catch (err: any) {
      setError(err.message || '加载兑换码失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, batchId, status])

  const revokeCode = useCallback(async (id: number) => {
    try {
      await del(`/api/v1/admin/redemption/codes/${id}/revoke`)
      setCodes(prev => prev.map(c => c.id === id ? { ...c, status: 'revoked' as const } : c))
    } catch (err: any) {
      throw new Error(err.message || '撤销兑换码失败')
    }
  }, [])

  const batchRevoke = useCallback(async (ids: number[]) => {
    try {
      await post('/api/v1/admin/redemption/codes/batch-revoke', { ids })
      setCodes(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: 'revoked' as const } : c))
    } catch (err: any) {
      throw new Error(err.message || '批量撤销失败')
    }
  }, [])

  return {
    codes,
    total,
    loading,
    error,
    loadCodes,
    revokeCode,
    batchRevoke,
  }
}
