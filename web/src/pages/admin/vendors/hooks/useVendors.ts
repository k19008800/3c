import { useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { Vendor, PaginatedData } from '@/types'

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchVendors = useCallback(async (params: {
    keyword?: string
    status?: string
    page: number
    pageSize: number
  }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await get<PaginatedData<Vendor>>('/api/v1/admin/vendors', params)
      setVendors(res.list || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const createVendor = useCallback(async (data: {
    name: string
    baseUrl: string
    description?: string
    status?: string
  }): Promise<Vendor | null> => {
    try {
      const v = await post<Vendor>('/api/v1/admin/vendors', data)
      return v
    } catch (err: any) {
      setError(err.message || '创建失败')
      return null
    }
  }, [])

  const updateVendor = useCallback(async (id: number, data: Partial<Vendor>): Promise<boolean> => {
    try {
      await patch(`/api/v1/admin/vendors/${id}`, data)
      return true
    } catch (err: any) {
      setError(err.message || '更新失败')
      return false
    }
  }, [])

  const deleteVendor = useCallback(async (id: number): Promise<boolean> => {
    try {
      await del(`/api/v1/admin/vendors/${id}`)
      return true
    } catch (err: any) {
      setError(err.message || '删除失败')
      return false
    }
  }, [])

  return {
    vendors,
    total,
    loading,
    error,
    fetchVendors,
    createVendor,
    updateVendor,
    deleteVendor,
  }
}