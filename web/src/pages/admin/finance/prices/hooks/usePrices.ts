import { useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { PriceListResponse, VendorModelRow, PriceHistoryRow } from '../types'

export function usePrices() {
  const [models, setModels] = useState<VendorModelRow[]>([])
  const [multiplier, setMultiplier] = useState(1.33)
  const [history, setHistory] = useState<PriceHistoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [modelsRes, historyRes] = await Promise.all([
        get<PriceListResponse>('/api/v1/admin/finance/prices', {}),
        get<PriceHistoryRow[]>('/api/v1/admin/finance/prices/history', { limit: 20 }),
      ])
      setModels(modelsRes.list || [])
      setMultiplier(modelsRes.multiplier || 1.33)
      setTotal(modelsRes.total || 0)
      setHistory(historyRes || [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const updatePrice = useCallback(async (
    id: number,
    data: { sellPriceInput?: string; sellPriceOutput?: string; costPriceInput?: string; costPriceOutput?: string }
  ): Promise<boolean> => {
    try {
      await post(`/api/v1/admin/finance/prices/${id}`, data)
      await fetchPrices()
      return true
    } catch (err: any) {
      setError(err.message || '更新失败')
      return false
    }
  }, [fetchPrices])

  const batchUpdateSell = useCallback(async (multiplier: number): Promise<boolean> => {
    try {
      await post('/api/v1/admin/finance/prices/batch-sell', { multiplier })
      await fetchPrices()
      return true
    } catch (err: any) {
      setError(err.message || '批量更新失败')
      return false
    }
  }, [fetchPrices])

  return {
    models,
    multiplier,
    history,
    total,
    loading,
    error,
    fetchPrices,
    updatePrice,
    batchUpdateSell,
  }
}