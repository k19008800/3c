import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { KeyGroup } from '../types'

export function useKeyGroups(vendorId: number | null) {
  const [groups, setGroups] = useState<KeyGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadGroups = useCallback(async () => {
    if (!vendorId) {
      setGroups([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await get<KeyGroup[]>(`/api/v1/admin/vendors/${vendorId}/key-groups`)
      setGroups(data || [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [vendorId])

  const createGroup = useCallback(async (data: Partial<KeyGroup>) => {
    if (!vendorId) throw new Error('未选择供应商')
    const result = await post(`/api/v1/admin/vendors/${vendorId}/key-groups`, data)
    await loadGroups()
    return result
  }, [vendorId, loadGroups])

  const updateGroup = useCallback(async (groupId: number, data: Partial<KeyGroup>) => {
    await patch(`/api/v1/admin/key-groups/${groupId}`, data)
    await loadGroups()
  }, [loadGroups])

  const deleteGroup = useCallback(async (groupId: number) => {
    await del(`/api/v1/admin/key-groups/${groupId}`)
    await loadGroups()
  }, [loadGroups])

  return {
    groups,
    loading,
    error,
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  }
}