import { useState, useCallback, useEffect } from 'react'
import { get, del, patch } from '@/lib/api'
import type { AgentOverviewItem } from '../types'

export function useRedemptionAgent() {
  const [overview, setOverview] = useState<AgentOverviewItem[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedName, setSelectedName] = useState('')
  const [codes, setCodes] = useState<any[]>([])
  const [codesTotal, setCodesTotal] = useState(0)
  const [codesPage, setCodesPage] = useState(1)
  const [codesPageSize, setCodesPageSize] = useState(20)
  const [codesLoading, setCodesLoading] = useState(false)
  const [forcingId, setForcingId] = useState<number | null>(null)

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError('')
    try {
      setOverview((await get<{ list: AgentOverviewItem[] }>('/api/v1/admin/redemption/agent-overview')).list || [])
    } catch (err: any) {
      setOverviewError(err.message || '获取代理数据失败')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const fetchCodes = useCallback(async () => {
    if (!selectedId) return
    setCodesLoading(true)
    try {
      const data = await get<{ list: any[]; total: number }>(
        `/api/v1/admin/redemption/agent/${selectedId}/detail`,
        { page: codesPage, pageSize: codesPageSize }
      )
      setCodes(data.list || [])
      setCodesTotal(data.total)
    } catch {
      // ignore
    } finally {
      setCodesLoading(false)
    }
  }, [selectedId, codesPage, codesPageSize])

  const viewDetail = useCallback((agent: AgentOverviewItem) => {
    setSelectedId(agent.agentId)
    setSelectedName(agent.agentName)
    setCodesPage(1)
  }, [])

  const backToOverview = useCallback(() => {
    setSelectedId(null)
    setSelectedName('')
  }, [])

  const forceRevoke = useCallback(async (codeId: number) => {
    setForcingId(codeId)
    try {
      await del(`/api/v1/redemption/codes/${codeId}`)
      fetchCodes()
    } catch (err: any) {
      throw new Error(err.message || '作废失败')
    } finally {
      setForcingId(null)
    }
  }, [fetchCodes])

  const forceDisable = useCallback(async (codeId: number) => {
    setForcingId(codeId)
    try {
      await patch(`/api/v1/redemption/codes/${codeId}`, { status: 'expired' })
      fetchCodes()
    } catch (err: any) {
      throw new Error(err.message || '停用失败')
    } finally {
      setForcingId(null)
    }
  }, [fetchCodes])

  const forceExtend = useCallback(async (codeId: number) => {
    setForcingId(codeId)
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await patch(`/api/v1/redemption/codes/${codeId}`, { expiresAt })
      fetchCodes()
    } catch (err: any) {
      throw new Error(err.message || '延期失败')
    } finally {
      setForcingId(null)
    }
  }, [fetchCodes])

  return {
    overview,
    overviewLoading,
    overviewError,
    selectedId,
    selectedName,
    codes,
    codesTotal,
    codesPage,
    codesPageSize,
    codesLoading,
    forcingId,
    codesTotalPages: Math.ceil(codesTotal / codesPageSize),
    setCodesPage,
    setCodesPageSize,
    fetchOverview,
    fetchCodes,
    viewDetail,
    backToOverview,
    forceRevoke,
    forceDisable,
    forceExtend,
  }
}

// Auto-fetch when tab is active
export function useRedemptionAgentAuto(active: boolean) {
  const state = useRedemptionAgent()
  useEffect(() => {
    if (active) state.fetchOverview()
  }, [active, state.fetchOverview])
  useEffect(() => {
    if (active && state.selectedId) state.fetchCodes()
  }, [active, state.selectedId, state.fetchCodes])
  return state
}
