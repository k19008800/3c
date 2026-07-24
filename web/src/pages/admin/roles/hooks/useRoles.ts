import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { RoleItem, PermItem, RoleForm } from '../types'

export function useRoles() {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [perms, setPerms] = useState<PermItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [roleRes, permRes] = await Promise.all([
        get<RoleItem[]>('/api/v1/admin/roles', {}),
        get<PermItem[]>('/api/v1/admin/roles/permissions', {}),
      ])
      setRoles(roleRes || [])
      setPerms(permRes || [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const createRole = useCallback(async (form: RoleForm): Promise<RoleItem | null> => {
    try {
      const r = await post<RoleItem>('/api/v1/admin/roles', form)
      setRoles((prev) => [...prev, r])
      return r
    } catch (err: any) {
      setError(err.message || '创建失败')
      return null
    }
  }, [])

  const updateRole = useCallback(async (id: number, form: Partial<RoleForm>): Promise<boolean> => {
    try {
      await patch(`/api/v1/admin/roles/${id}`, form)
      setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...form } : r)))
      return true
    } catch (err: any) {
      setError(err.message || '更新失败')
      return false
    }
  }, [])

  const deleteRole = useCallback(async (id: number): Promise<boolean> => {
    try {
      await del(`/api/v1/admin/roles/${id}`)
      setRoles((prev) => prev.filter((r) => r.id !== id))
      return true
    } catch (err: any) {
      setError(err.message || '删除失败')
      return false
    }
  }, [])

  return {
    roles,
    perms,
    loading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
  }
}