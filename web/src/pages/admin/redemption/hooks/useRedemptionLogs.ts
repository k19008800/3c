import { useState, useCallback, useEffect } from 'react'
import { get } from '@/lib/api'
import type { AdminRedemptionLog } from '../types'

export function useRedemptionLogs() {
  const [logs, setLogs] = useState<AdminRedemptionLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    email: '',
    batchId: '',
    startDate: '',
    endDate: '',
    code: '',
  })
  const [filterApplied, setFilterApplied] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (filterApplied) {
        if (filter.email) params.email = filter.email
        if (filter.batchId) params.batchId = filter.batchId
        if (filter.startDate) params.startDate = filter.startDate
        if (filter.endDate) params.endDate = filter.endDate
        if (filter.code) params.code = filter.code
      }
      const data = await get<{ list: AdminRedemptionLog[]; total: number }>('/api/v1/redemption/admin-logs', params)
      setLogs(data.list || [])
      setTotal(data.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filterApplied, filter])

  const applyFilter = useCallback(() => {
    setPage(1)
    setFilterApplied(true)
  }, [])

  const resetFilter = useCallback(() => {
    setFilter({ email: '', batchId: '', startDate: '', endDate: '', code: '' })
    setPage(1)
    setFilterApplied(false)
  }, [])

  return {
    logs,
    total,
    page,
    pageSize,
    loading,
    filter,
    filterApplied,
    totalPages: Math.ceil(total / pageSize),
    setPage,
    setPageSize,
    setFilter,
    fetchLogs,
    applyFilter,
    resetFilter,
  }
}

// Auto-fetch when tab is active
export function useRedemptionLogsAuto(active: boolean) {
  const state = useRedemptionLogs()
  useEffect(() => {
    if (active) state.fetchLogs()
  }, [active, state.fetchLogs])
  return state
}
