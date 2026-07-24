import { useState, useCallback, useEffect } from 'react'
import { get, post, del } from '@/lib/api'
import type { RedemptionCode } from '../types'

export function useRedemptionCodes() {
  const [codes, setCodes] = useState<RedemptionCode[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<{ batchId?: string; status?: string }>({})
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [batchActionRunning, setBatchActionRunning] = useState(false)

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (filter.batchId) params.batchId = filter.batchId
      if (filter.status) params.status = filter.status
      const data = await get<{ list: RedemptionCode[]; total: number }>('/api/v1/redemption/codes', params)
      setCodes(data.list || [])
      setTotal(data.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filter])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const revoke = useCallback(async (id: number, onSuccess?: () => void) => {
    setRevokingId(id)
    try {
      await del(`/api/v1/redemption/codes/${id}`)
      fetchCodes()
      onSuccess?.()
    } catch (err: any) {
      throw new Error(err.message || '作废失败')
    } finally {
      setRevokingId(null)
    }
  }, [fetchCodes])

  const exportUnused = useCallback(async () => {
    setExporting(true)
    try {
      const data = await get<{ list: RedemptionCode[] }>('/api/v1/redemption/codes', { status: 'unused', pageSize: 10000 })
      const codes_only = (data.list || []).map(c => c.code).join('\n')
      const blob = new Blob([codes_only], { type: 'text/plain;charset=utf-8' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'unused-codes.txt'
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      // fallback ignored
    } finally {
      setExporting(false)
    }
  }, [])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(prev => prev.length === codes.length ? [] : codes.map(c => c.id))
  }, [codes])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  const batchAction = useCallback(async (action: 'disable' | 'enable' | 'revoke', onSuccess?: () => void) => {
    if (selectedIds.length === 0) return
    setBatchActionRunning(true)
    try {
      await post('/api/v1/admin/redemption/batch-action', { action, codeIds: selectedIds, reason: `管理员批量${action}` })
      setSelectedIds([])
      fetchCodes()
      onSuccess?.()
    } catch (err: any) {
      throw new Error(err.message || `批量操作失败`)
    } finally {
      setBatchActionRunning(false)
    }
  }, [selectedIds, fetchCodes])

  return {
    codes,
    total,
    page,
    pageSize,
    loading,
    filter,
    selectedIds,
    revokingId,
    exporting,
    batchActionRunning,
    totalPages: Math.ceil(total / pageSize),
    setPage,
    setPageSize,
    setFilter,
    refetch: fetchCodes,
    revoke,
    exportUnused,
    toggleSelect,
    selectAll,
    clearSelection,
    batchAction,
  }
}
