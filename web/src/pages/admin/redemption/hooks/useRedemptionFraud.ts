import { useState, useCallback, useEffect } from 'react'
import { get, post, patch } from '@/lib/api'
import type { FraudStats, FraudEvent, BannedIp } from '../types'

export function useRedemptionFraud() {
  const [stats, setStats] = useState<FraudStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [events, setEvents] = useState<FraudEvent[]>([])
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventsPage, setEventsPage] = useState(1)
  const [eventsPageSize, setEventsPageSize] = useState(20)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsFilter, setEventsFilter] = useState({
    eventType: '',
    severity: '',
    acknowledged: '',
    ip: '',
    startDate: '',
    endDate: '',
  })
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([])
  const [bannedIpsLoading, setBannedIpsLoading] = useState(false)
  const [banningIp, setBanningIp] = useState(false)
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null)
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([])
  const [riskActionRunning, setRiskActionRunning] = useState(false)

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      setStats(await get<FraudStats>('/api/v1/redemption/fraud/stats'))
    } catch {
      // ignore
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const params: any = { page: eventsPage, pageSize: eventsPageSize }
      if (eventsFilter.eventType) params.eventType = eventsFilter.eventType
      if (eventsFilter.severity) params.severity = eventsFilter.severity
      if (eventsFilter.acknowledged) params.acknowledged = eventsFilter.acknowledged
      if (eventsFilter.ip) params.ip = eventsFilter.ip
      if (eventsFilter.startDate) params.startDate = eventsFilter.startDate
      if (eventsFilter.endDate) params.endDate = eventsFilter.endDate
      const data = await get<{ list: FraudEvent[]; total: number }>('/api/v1/redemption/fraud-events', params)
      setEvents(data.list || [])
      setEventsTotal(data.total)
    } catch {
      // ignore
    } finally {
      setEventsLoading(false)
    }
  }, [eventsPage, eventsPageSize, eventsFilter])

  const fetchBannedIps = useCallback(async () => {
    setBannedIpsLoading(true)
    try {
      setBannedIps((await get<{ list: BannedIp[] }>('/api/v1/redemption/fraud/banned-ips')).list || [])
    } catch {
      // ignore
    } finally {
      setBannedIpsLoading(false)
    }
  }, [])

  const banIp = useCallback(async (ip: string, reason?: string) => {
    setBanningIp(true)
    try {
      await post('/api/v1/redemption/fraud/ban-ip', { ip, reason: reason || undefined })
      fetchBannedIps()
      fetchStats()
    } catch (err: any) {
      throw new Error(err.message || '封禁失败')
    } finally {
      setBanningIp(false)
    }
  }, [fetchBannedIps, fetchStats])

  const unbanIp = useCallback(async (ip: string) => {
    try {
      await post('/api/v1/redemption/fraud/unban-ip', { ip })
      fetchBannedIps()
      fetchStats()
    } catch (err: any) {
      throw new Error(err.message || '解封失败')
    }
  }, [fetchBannedIps, fetchStats])

  const acknowledge = useCallback(async (id: number) => {
    setAcknowledgingId(id)
    try {
      await patch(`/api/v1/redemption/fraud-events/${id}/acknowledge`, {})
      fetchEvents()
    } catch {
      try {
        await patch(`/api/v1/redemption/fraud/events/${id}`, { acknowledged: true })
        fetchEvents()
      } catch {
        // ignore
      }
    } finally {
      setAcknowledgingId(null)
    }
  }, [fetchEvents])

  const toggleSelectEvent = useCallback((id: number) => {
    setSelectedEventIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const selectAllEvents = useCallback(() => {
    setSelectedEventIds(prev => prev.length === events.length ? [] : events.map(e => e.id))
  }, [events])

  const riskBatchAction = useCallback(async (action: 'revoke_codes' | 'ban_ip' | 'acknowledge') => {
    if (selectedEventIds.length === 0) return
    setRiskActionRunning(true)
    try {
      await post('/api/v1/admin/redemption/risk-action', { action, eventIds: selectedEventIds, reason: `管理员批量${action}` })
      setSelectedEventIds([])
      fetchEvents()
      fetchStats()
    } catch (err: any) {
      throw new Error(err.message || '操作失败')
    } finally {
      setRiskActionRunning(false)
    }
  }, [selectedEventIds, fetchEvents, fetchStats])

  return {
    stats,
    statsLoading,
    events,
    eventsTotal,
    eventsPage,
    eventsPageSize,
    eventsLoading,
    eventsFilter,
    bannedIps,
    bannedIpsLoading,
    banningIp,
    acknowledgingId,
    selectedEventIds,
    riskActionRunning,
    eventsTotalPages: Math.ceil(eventsTotal / eventsPageSize),
    setEventsPage,
    setEventsPageSize,
    setEventsFilter,
    fetchStats,
    fetchEvents,
    fetchBannedIps,
    banIp,
    unbanIp,
    acknowledge,
    toggleSelectEvent,
    selectAllEvents,
    riskBatchAction,
  }
}

// Auto-fetch when tab is active
export function useRedemptionFraudAuto(active: boolean) {
  const state = useRedemptionFraud()
  useEffect(() => {
    if (active) {
      state.fetchStats()
      state.fetchEvents()
      state.fetchBannedIps()
    }
  }, [active, state.fetchStats, state.fetchEvents, state.fetchBannedIps])
  return state
}
