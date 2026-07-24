import { useState, useCallback } from 'react'
import { get, post, del } from '@/lib/api'
import type { UserInRole, CandidateUser } from '../types'

export function useRoleUsers(roleId: number | null) {
  const [users, setUsers] = useState<UserInRole[]>([])
  const [candidates, setCandidates] = useState<CandidateUser[]>([])
  const [loading, setLoading] = useState(false)

  const fetchUsers = useCallback(async (id: number) => {
    setLoading(true)
    try {
      const res = await get<UserInRole[]>(`/api/v1/admin/roles/${id}/users`, {})
      setUsers(res || [])
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCandidates = useCallback(async (keyword: string) => {
    try {
      const res = await get<{ list: CandidateUser[] }>('/api/v1/admin/users', { keyword, pageSize: 20 })
      setCandidates(res?.list || [])
    } catch {
      setCandidates([])
    }
  }, [])

  const assignUser = useCallback(async (userId: number): Promise<boolean> => {
    if (!roleId) return false
    try {
      await post(`/api/v1/admin/roles/${roleId}/users/${userId}`, {})
      await fetchUsers(roleId)
      return true
    } catch {
      return false
    }
  }, [roleId, fetchUsers])

  const removeUser = useCallback(async (userId: number): Promise<boolean> => {
    if (!roleId) return false
    try {
      await del(`/api/v1/admin/roles/${roleId}/users/${userId}`)
      setUsers((prev) => prev.filter((u) => u.userId !== userId))
      return true
    } catch {
      return false
    }
  }, [roleId])

  return {
    users,
    candidates,
    loading,
    fetchUsers,
    fetchCandidates,
    assignUser,
    removeUser,
  }
}