import { useState, useCallback, useEffect } from 'react'
import { get } from '@/lib/api'
import type { VendorModel, PaginatedData } from '@/types'

interface UseVendorModelsOptions {
  pageSize?: number
}

interface UseVendorModelsReturn {
  items: VendorModel[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  error: string
  keyword: string
  statusFilter: string
  setKeyword: (k: string) => void
  setStatusFilter: (s: string) => void
  setPage: (p: number) => void
  refetch: () => void
}

export function useVendorModels(options: UseVendorModelsOptions = {}): UseVendorModelsReturn {
  const { pageSize = 20 } = options

  const [items, setItems] = useState<VendorModel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const totalPages = Math.ceil(total / pageSize)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<VendorModel>>('/api/v1/admin/vendor-models', params)
      setItems(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取供应商模型映射列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, statusFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleSetKeyword = (k: string) => {
    setKeyword(k)
    setPage(1)
  }

  const handleSetStatusFilter = (s: string) => {
    setStatusFilter(s)
    setPage(1)
  }

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    loading,
    error,
    keyword,
    statusFilter,
    setKeyword: handleSetKeyword,
    setStatusFilter: handleSetStatusFilter,
    setPage,
    refetch: fetchItems,
  }
}

export function useModelOptions() {
  const [vendors, setVendors] = useState<{ id: number; name: string }[]>([])
  const [models, setModels] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [v, m] = await Promise.all([
          get<{ list: { id: number; name: string }[] }>('/api/v1/admin/vendors', { pageSize: 1000 }),
          get<{ list: { id: number; name: string }[] }>('/api/v1/admin/models', { pageSize: 1000 }),
        ])
        setVendors(v.list || [])
        setModels(m.list || [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { vendors, models, loading }
}