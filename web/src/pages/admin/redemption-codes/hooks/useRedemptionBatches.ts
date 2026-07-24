// useRedemptionBatches - 批次数据管理

import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { RedemptionBatch } from '../types'

interface UseBatchesOptions {
  page?: number
  pageSize?: number
}

export function useRedemptionBatches(options: UseBatchesOptions = {}) {
  const { page = 1, pageSize = 20 } = options

  const [batches, setBatches] = useState<RedemptionBatch[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadBatches = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: RedemptionBatch[]; total: number }>(
        '/api/v1/admin/redemption/batches',
        { page: p, pageSize: ps }
      )
      setBatches(data.list || [])
      setTotal(data.total || 0)
    } catch (err: any) {
      setError(err.message || '加载批次失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  const createBatch = useCallback(async (data: Partial<RedemptionBatch>) => {
    try {
      const batch = await post<RedemptionBatch>('/api/v1/admin/redemption/batches', data)
      setBatches(prev => [batch, ...prev])
      setTotal(prev => prev + 1)
      return batch
    } catch (err: any) {
      throw new Error(err.message || '创建批次失败')
    }
  }, [])

  const updateBatch = useCallback(async (id: number, data: Partial<RedemptionBatch>) => {
    try {
      const batch = await patch<RedemptionBatch>(`/api/v1/admin/redemption/batches/${id}`, data)
      setBatches(prev => prev.map(b => b.id === id ? batch : b))
      return batch
    } catch (err: any) {
      throw new Error(err.message || '更新批次失败')
    }
  }, [])

  const revokeBatch = useCallback(async (id: number) => {
    try {
      await del(`/api/v1/admin/redemption/batches/${id}/revoke`)
      setBatches(prev => prev.map(b => b.id === id ? { ...b, status: 'revoked' as const } : b))
    } catch (err: any) {
      throw new Error(err.message || '撤销批次失败')
    }
  }, [])

  const toggleBatch = useCallback(async (id: number, status: 'active' | 'inactive') => {
    return updateBatch(id, { status })
  }, [updateBatch])

  return {
    batches,
    total,
    loading,
    error,
    loadBatches,
    createBatch,
    updateBatch,
    revokeBatch,
    toggleBatch,
  }
}
