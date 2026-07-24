import { useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { ReconciliationReport, ReconTrendPoint, ReconBalanceCheck } from '@/types'

export function useReconciliation() {
  const [report, setReport] = useState<ReconciliationReport | null>(null)
  const [trend, setTrend] = useState<ReconTrendPoint[]>([])
  const [checks, setChecks] = useState<ReconBalanceCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReconciliation = useCallback(async (params: {
    startDate?: string
    endDate?: string
    agentId?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const [reportRes, trendRes, checksRes] = await Promise.all([
        get<ReconciliationReport>('/api/v1/admin/finance/reconciliation', params),
        get<ReconTrendPoint[]>('/api/v1/admin/finance/reconciliation/trend', params),
        get<ReconBalanceCheck[]>('/api/v1/admin/finance/reconciliation/checks', params),
      ])
      setReport(reportRes)
      setTrend(trendRes || [])
      setChecks(checksRes || [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    report,
    trend,
    checks,
    loading,
    error,
    fetchReconciliation,
  }
}