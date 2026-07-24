import { useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { ProfitData, ProfitSummary } from '../types'

export function useProfitAnalysis() {
  const [data, setData] = useState<ProfitData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (params: {
    startDate?: string
    endDate?: string
    vendorId?: number
  } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<ProfitData>('/api/v1/admin/finance/profit-analysis', params)
      setData(res)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const exportReport = useCallback(async (params: {
    startDate?: string
    endDate?: string
    vendorId?: number
  }) => {
    try {
      const blob = await get<Blob>('/api/v1/admin/finance/profit-analysis/export', {
        ...params,
        format: 'csv',
      })
      // Download blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `profit-analysis-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Export failed:', err)
    }
  }, [])

  return {
    data,
    loading,
    error,
    loadData,
    exportReport,
  }
}