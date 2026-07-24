import { useState, useCallback, useEffect } from 'react'
import { get, patch, del } from '@/lib/api'
import type { RedemptionBatch } from '../types'

export function useRedemptionBatches() {
  const [batches, setBatches] = useState<RedemptionBatch[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [exportingId, setExportingId] = useState<number | null>(null)

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<{ list: RedemptionBatch[]; total: number }>('/api/v1/redemption/codes', { page, pageSize })
      setBatches(data.list || [])
      setTotal(data.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  const toggleStatus = useCallback(async (batch: RedemptionBatch, onSuccess?: () => void) => {
    const newStatus = batch.status === 'active' ? 'disabled' : 'active'
    setTogglingId(batch.id)
    try {
      await patch(`/api/v1/redemption/batches/${batch.id}`, { status: newStatus })
      fetchBatches()
      onSuccess?.()
    } catch (err: any) {
      throw new Error(err.message || '状态切换失败')
    } finally {
      setTogglingId(null)
    }
  }, [fetchBatches])

  const exportBatch = useCallback(async (batchId: number) => {
    setExportingId(batchId)
    try {
      const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { batchId, pageSize: 10000 })
      const csv = '\uFEFFcode,amount,status,usedAt\n' + (data.list || []).map(c => `${c.code},${c.amount},${c.status},${c.usedAt || ''}`).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `batch-${batchId}-codes.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err: any) {
      throw new Error(err.message || '导出失败')
    } finally {
      setExportingId(null)
    }
  }, [])

  return {
    batches,
    total,
    page,
    pageSize,
    loading,
    togglingId,
    exportingId,
    totalPages: Math.ceil(total / pageSize),
    setPage,
    setPageSize,
    refetch: fetchBatches,
    toggleStatus,
    exportBatch,
  }
}

// Import RedemptionCode type for exportBatch
import type { RedemptionCode } from '../types'
