import { useState, useCallback } from 'react'
import { get, patch, del } from '@/lib/api'
import type { KeyItem, StatusTab } from '../types'

interface ItemsResponse {
  items: KeyItem[]
  total: number
  page: number
  pageSize: number
}

export function useKeyItems(groupId: number | null) {
  const [items, setItems] = useState<KeyItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [showDeleted, setShowDeleted] = useState(false)

  const loadItems = useCallback(async () => {
    if (!groupId) {
      setItems([])
      setTotal(0)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (showDeleted) params.showDeleted = 'true'
      if (searchQuery) params.search = searchQuery
      if (statusTab !== 'all') params.status = statusTab
      const data = await get<ItemsResponse>(`/api/v1/admin/key-groups/${groupId}/items`, params)
      setItems(data.items || [])
      setTotal(data.total ?? 0)
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [groupId, page, pageSize, showDeleted, searchQuery, statusTab])

  const updateItem = useCallback(async (itemId: number, data: Partial<KeyItem>) => {
    await patch(`/api/v1/admin/key-items/${itemId}`, data)
    await loadItems()
  }, [loadItems])

  const deleteItem = useCallback(async (itemId: number) => {
    await del(`/api/v1/admin/key-items/${itemId}`)
    await loadItems()
  }, [loadItems])

  const toggleStatus = useCallback(async (itemId: number, currentStatus: boolean) => {
    await patch(`/api/v1/admin/key-items/${itemId}`, { status: !currentStatus })
    await loadItems()
  }, [loadItems])

  return {
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    searchQuery,
    statusTab,
    showDeleted,
    setPage,
    setPageSize,
    setSearchQuery,
    setStatusTab,
    setShowDeleted,
    loadItems,
    updateItem,
    deleteItem,
    toggleStatus,
  }
}