// Redemption 数据获取 hooks

import { useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { RedemptionLogsData, UserCode, GiftHistoryData, PendingBenefit, ActivityItem } from '../types'

export function useRedemptionLogs() {
  const [logs, setLogs] = useState<RedemptionLogsData['list']>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<RedemptionLogsData>('/api/v1/redemption/logs', { page, pageSize })
      setLogs(data.list || [])
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取兑换记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  return { logs, total, page, pageSize, loading, error, setPage, setPageSize, fetch }
}

export function useMyCodes() {
  const [codes, setCodes] = useState<UserCode[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: UserCode[]; total: number }>('/api/v1/redemption/codes', {
        page,
        pageSize,
        status: 'unused',
      })
      setCodes(data.list || [])
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取兑换码失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  return { codes, total, page, pageSize, loading, error, setPage, setPageSize, fetch }
}

export function useGiftHistory() {
  const [records, setRecords] = useState<GiftHistoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<GiftHistoryData>('/api/v1/redemption/gift-history')
      setRecords(data)
    } catch (err: any) {
      setError(err.message || '获取转赠记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return { records, loading, error, fetch }
}

export function usePendingBenefits() {
  const [benefits, setBenefits] = useState<PendingBenefit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activatingId, setActivatingId] = useState<number | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ list: PendingBenefit[] }>('/api/v1/redemption/pending')
      setBenefits(data.list || [])
    } catch (err: any) {
      setError(err.message || '获取未激活权益失败')
    } finally {
      setLoading(false)
    }
  }, [])

  return { benefits, loading, error, activatingId, setActivatingId, fetch }
}

export function useActivities() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<{ list: ActivityItem[] }>('/api/v1/redemption/activities')
      setActivities(data.list || [])
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }, [])

  return { activities, loading, fetch }
}