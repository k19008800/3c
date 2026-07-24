import { useState, useCallback, useEffect } from 'react'
import { get } from '@/lib/api'
import type { AuditLogItem } from '../types'

export function useRedemptionAudit() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({ startDate: '', endDate: '' })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (filter.startDate) params.startDate = filter.startDate
      if (filter.endDate) params.endDate = filter.endDate
      const data = await get<{ list: AuditLogItem[]; total: number }>('/api/v1/admin/redemption/audit-logs', params)
      setLogs(data.list || [])
      setTotal(data.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filter])

  return {
    logs,
    total,
    page,
    pageSize,
    loading,
    filter,
    totalPages: Math.ceil(total / pageSize),
    setPage,
    setPageSize,
    setFilter,
    fetchLogs,
  }
}

// Auto-fetch when tab is active
export function useRedemptionAuditAuto(active: boolean) {
  const state = useRedemptionAudit()
  useEffect(() => {
    if (active) state.fetchLogs()
  }, [active, state.fetchLogs])
  return state
}
