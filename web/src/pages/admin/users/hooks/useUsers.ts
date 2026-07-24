import { useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { AdminUser, PaginatedData } from '@/types'

export interface UsersFilters {
  keyword: string
  status: string
  role: string
}

export interface UseUsersReturn {
  users: AdminUser[]
  total: number
  loading: boolean
  error: string
  page: number
  pageSize: number
  filters: UsersFilters
  selectedIds: Set<number>
  setSelectedIds: (ids: Set<number>) => void
  totalPages: number
  
  // Actions
  setPage: (page: number) => void
  setFilters: (filters: Partial<UsersFilters>) => void
  toggleSelect: (id: number) => void
  toggleAll: () => void
  handleBatchAction: (action: 'disable' | 'enable') => Promise<void>
  handleExportCSV: () => Promise<void>
  refreshUsers: () => Promise<void>
}

export function useUsers(initialPage = 1, initialPageSize = 20): UseUsersReturn {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [pageSize, _] = useState(initialPageSize)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<UsersFilters>({
    keyword: '',
    status: '',
    role: ''
  })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const totalPages = Math.ceil(total / pageSize)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (filters.keyword) params.keyword = filters.keyword
      if (filters.status) params.status = filters.status
      if (filters.role) params.role = filters.role
      
      const data = await get<PaginatedData<AdminUser>>('/api/v1/admin/users', params)
      setUsers(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取用户列表失败')
    } finally { 
      setLoading(false) 
    }
  }, [page, pageSize, filters.keyword, filters.status, filters.role])

  const refreshUsers = useCallback(async () => {
    await fetchUsers()
  }, [fetchUsers])

  const updateFilters = useCallback((newFilters: Partial<UsersFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
    setPage(1) // Reset to first page when filters change
  }, [])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === users.length) {
        return new Set()
      } else {
        return new Set(users.map(u => u.id))
      }
    })
  }, [users])

  const handleBatchAction = useCallback(async (action: 'disable' | 'enable') => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    try {
      if (action === 'disable') {
        await post('/api/v1/admin/users/batch/disable', { userIds: ids })
      } else {
        await post('/api/v1/admin/users/batch/enable', { userIds: ids })
      }
      setSelectedIds(new Set())
      await fetchUsers()
    } catch (err: any) {
      setError(err.message || '批量操作失败')
    }
  }, [selectedIds, fetchUsers])

  const handleExportCSV = useCallback(async () => {
    try {
      const params: any = {}
      if (filters.keyword) params.keyword = filters.keyword
      if (filters.status) params.status = filters.status
      if (filters.role) params.role = filters.role
      
      const res = await fetch(`/api/v1/admin/users/export?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users_export_${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError('导出失败: ' + (err.message || ''))
    }
  }, [filters.keyword, filters.status, filters.role])

  return {
    users,
    total,
    loading,
    error,
    page,
    pageSize,
    filters,
    selectedIds,
    setSelectedIds,
    totalPages,
    setPage,
    setFilters: updateFilters,
    toggleSelect,
    toggleAll,
    handleBatchAction,
    handleExportCSV,
    refreshUsers
  }
}