import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { Agent, PaginatedData } from '@/types'

export function useAgentsList(onStatsChange?: () => void) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAgents = useCallback(async (params: {
    page: number
    pageSize: number
    keyword?: string
    status?: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<PaginatedData<Agent>>('/api/v1/admin/agents', params)
      setAgents(res.list || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const createAgent = useCallback(async (data: {
    email: string
    nickname?: string
    password: string
  }): Promise<Agent | null> => {
    try {
      const a = await post<Agent>('/api/v1/admin/agents', data)
      onStatsChange?.()
      return a
    } catch (err: any) {
      setError(err.message || '创建失败')
      return null
    }
  }, [onStatsChange])

  const updateAgent = useCallback(async (id: number, data: Partial<Agent>): Promise<boolean> => {
    try {
      await patch(`/api/v1/admin/agents/${id}`, data)
      onStatsChange?.()
      return true
    } catch (err: any) {
      setError(err.message || '更新失败')
      return false
    }
  }, [onStatsChange])

  const deleteAgent = useCallback(async (id: number): Promise<boolean> => {
    try {
      await del(`/api/v1/admin/agents/${id}`)
      onStatsChange?.()
      return true
    } catch (err: any) {
      setError(err.message || '删除失败')
      return false
    }
  }, [onStatsChange])

  return {
    agents,
    total,
    loading,
    error,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
  }
}