import { useState, useCallback, useMemo } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { Vendor } from '@/types'

export interface KeyGroup {
  id: number
  vendorId: number
  name: string
  strategy: string
  description: string | null
  status: boolean
  keyCount: number
  activeCount: number
  downCount: number
  disabledCount: number
  createdAt: string
  updatedAt: string
}

export interface KeyItem {
  id: number
  groupId: number
  apiKeyPrefix: string | null
  apiKeyEncrypted?: string
  weight: number
  priority: number
  status: boolean
  isDown: boolean
  consecutiveFailures: number
  totalCalls: number
  successCalls: number
  sellPriceInput: string | null
  sellPriceOutput: string | null
  costPriceInput: string | null
  costPriceOutput: string | null
  notes: string | null
  deletedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface ChannelRef {
  id: number
  vendorId: number
  vendorName: string
  modelId: number
  modelName: string
  upstreamModelName: string
  status: boolean
  isDown: boolean
}

export interface TestResult {
  itemId: number
  success: boolean
  durationMs: number
  statusCode?: number
  error?: string
}

export interface VendorSummary {
  vendorId: number
  vendorName: string
  groupCount: number
  keyCount: number
}

export type StatusTab = 'all' | 'active' | 'down' | 'disabled' | 'deleted'

export interface UseVendorKeyGroupsReturn {
  // Data states
  vendors: Vendor[]
  vendorSummaries: VendorSummary[]
  groups: KeyGroup[]
  items: KeyItem[]
  channels: ChannelRef[]
  testResults: TestResult[] | null
  
  // Selection states
  selectedVendorId: number | null
  selectedGroupId: number | null
  selectedIds: Set<number>
  
  // Filter states
  searchQuery: string
  statusTab: StatusTab
  showDeleted: boolean
  
  // Loading states
  loading: boolean
  itemsLoading: boolean
  channelsLoading: boolean
  testing: boolean
  
  // UI states
  revealedIds: Record<number, string>
  editingNotes: Record<number, string>
  savingNotes: Record<number, boolean>
  
  // Error state
  error: string
  
  // Actions
  setSelectedVendorId: (id: number | null) => void
  setSelectedGroupId: (id: number | null) => void
  setSearchQuery: (query: string) => void
  setStatusTab: (tab: StatusTab) => void
  setShowDeleted: (show: boolean) => void
  
  // Data loading
  loadVendors: () => Promise<void>
  loadGroups: (vendorId: number) => Promise<void>
  loadItems: (groupId: number, page: number, pageSize: number) => Promise<void>
  loadChannels: (groupId: number) => Promise<void>
  
  // Key operations
  toggleSelect: (id: number) => void
  toggleAll: () => void
  handleRevealKey: (item: KeyItem) => Promise<void>
  handleCopyKey: (fullKey: string) => Promise<void>
  handleToggleItem: (item: KeyItem) => Promise<void>
  handleSaveNotes: (itemId: number) => Promise<void>
  
  // Test operations
  handleTestItem: (item: KeyItem) => Promise<void>
  handleBatchTest: (itemIds: number[]) => Promise<void>
  
  // Calculated values
  filteredItems: KeyItem[]
  stats: {
    total: number
    active: number
    down: number
    disabled: number
    deleted: number
  }
  tabCounts: {
    all: number
    active: number
    down: number
    disabled: number
    deleted: number
  }
}

export function useVendorKeyGroups(
  initialPage = 1,
  initialPageSize = 20
): UseVendorKeyGroupsReturn {
  // Data states
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorSummaries, setVendorSummaries] = useState<VendorSummary[]>([])
  const [groups, setGroups] = useState<KeyGroup[]>([])
  const [items, setItems] = useState<KeyItem[]>([])
  const [channels, setChannels] = useState<ChannelRef[]>([])
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  
  // Selection states
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [showDeleted, setShowDeleted] = useState(false)
  
  // Loading states
  const [loading, setLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  
  // UI states
  const [revealedIds, setRevealedIds] = useState<Record<number, string>>({})
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({})
  const [savingNotes, setSavingNotes] = useState<Record<number, boolean>>({})
  
  // Error state
  const [error, setError] = useState('')

  // Load vendors and summaries
  const loadVendors = useCallback(async () => {
    try {
      const [vData, summaryData] = await Promise.all([
        get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
        get<VendorSummary[]>('/api/v1/admin/vendors/key-group-summary')
      ])
      
      setVendors(Array.isArray(vData?.list) ? vData.list : [])
      setVendorSummaries(Array.isArray(summaryData) ? summaryData : [])
    } catch (err: any) {
      setError(err.message || '加载供应商失败')
    }
  }, [])

  // Load groups for selected vendor
  const loadGroups = useCallback(async (vendorId: number) => {
    setLoading(true)
    setError('')
    try {
      const data = await get<KeyGroup[]>(`/api/v1/admin/vendors/${vendorId}/key-groups`)
      setGroups(data || [])
    } catch (err: any) {
      setError(err.message || '加载分组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load items for selected group
  const loadItems = useCallback(async (groupId: number, page: number, pageSize: number) => {
    setItemsLoading(true)
    setChannels([])
    setTestResults(null)
    setRevealedIds({})
    setSelectedIds(new Set())
    
    try {
      const params: any = { page, pageSize }
      if (showDeleted) params.showDeleted = 'true'
      
      const data = await get<{ items: KeyItem[]; total: number; page: number; pageSize: number }>(
        `/api/v1/admin/key-groups/${groupId}/items`,
        params
      )
      
      setItems(data.items || [])
    } catch (err: any) {
      setError(err.message || '加载密钥列表失败')
    } finally {
      setItemsLoading(false)
    }
  }, [showDeleted])

  // Load channels for selected group
  const loadChannels = useCallback(async (groupId: number) => {
    setChannelsLoading(true)
    try {
      const data = await get<{ total: number; list: ChannelRef[] }>(
        `/api/v1/admin/key-groups/${groupId}/associated-channels`
      )
      setChannels(data.list || [])
    } catch (err: any) {
      setError(err.message || '加载关联通道失败')
    } finally {
      setChannelsLoading(false)
    }
  }, [])

  // Filter items based on status tab and search query
  const filteredItems = useMemo(() => {
    let list = items.filter(i => {
      if (i.deletedAt) return statusTab === 'deleted'
      if (statusTab === 'all') return true
      if (statusTab === 'active') return i.status && !i.isDown
      if (statusTab === 'down') return i.isDown
      if (statusTab === 'disabled') return !i.status
      return true
    })

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(i =>
        (i.apiKeyPrefix && i.apiKeyPrefix.toLowerCase().includes(q)) ||
        String(i.id).includes(q) ||
        (i.notes && i.notes.toLowerCase().includes(q))
      )
    }
    
    return list
  }, [items, statusTab, searchQuery])

  // Calculate stats from all items (excluding deleted)
  const stats = useMemo(() => {
    const active = items.filter(i => i.status && !i.isDown && !i.deletedAt)
    const down = items.filter(i => i.isDown && !i.deletedAt)
    const disabled = items.filter(i => !i.status && !i.deletedAt)
    const deleted = items.filter(i => i.deletedAt)
    
    return {
      total: active.length + down.length + disabled.length,
      active: active.length,
      down: down.length,
      disabled: disabled.length,
      deleted: deleted.length,
    }
  }, [items])

  // Tab counts
  const tabCounts = useMemo(() => {
    const all = items.filter(i => !i.deletedAt).length
    const active = items.filter(i => i.status && !i.isDown && !i.deletedAt).length
    const down = items.filter(i => i.isDown && !i.deletedAt).length
    const disabled = items.filter(i => !i.status && !i.deletedAt).length
    const deleted = items.filter(i => i.deletedAt).length
    
    return { all, active, down, disabled, deleted }
  }, [items])

  // Selection operations
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === filteredItems.length) {
        return new Set()
      } else {
        return new Set(filteredItems.map(item => item.id))
      }
    })
  }, [filteredItems])

  // Key operations
  const handleRevealKey = useCallback(async (item: KeyItem) => {
    if (revealedIds[item.id]) {
      setRevealedIds(prev => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }

    try {
      const data = await post<{ data: { fullKey: string } }>(
        `/api/v1/admin/key-group-items/${item.id}/reveal`
      )
      
      setRevealedIds(prev => ({
        ...prev,
        [item.id]: data.data.fullKey
      }))
      
      // Auto-hide after 30s
      setTimeout(() => {
        setRevealedIds(prev => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
      }, 30000)
    } catch (err: any) {
      setError('查看完整 Key 失败: ' + err.message)
    }
  }, [revealedIds])

  const handleCopyKey = useCallback(async (fullKey: string) => {
    try {
      await navigator.clipboard.writeText(fullKey)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = fullKey
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }, [])

  const handleToggleItem = useCallback(async (item: KeyItem) => {
    try {
      await patch(`/api/v1/admin/key-group-items/${item.id}`, {
        status: !item.status
      })
      
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, status: !i.status } : i
      ))
    } catch (err: any) {
      setError(err.message || '切换状态失败')
    }
  }, [])

  const handleSaveNotes = useCallback(async (itemId: number) => {
    const notes = editingNotes[itemId]
    if (notes === undefined) return
    
    setSavingNotes(prev => ({ ...prev, [itemId]: true }))
    
    try {
      await patch(`/api/v1/admin/key-group-items/${itemId}`, {
        notes: notes || null
      })
      
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, notes: notes || null } : i
      ))
      
      setEditingNotes(prev => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    } catch (err: any) {
      setError('保存备注失败: ' + err.message)
    } finally {
      setSavingNotes(prev => ({ ...prev, [itemId]: false }))
    }
  }, [editingNotes])

  // Test operations
  const handleTestItem = useCallback(async (item: KeyItem) => {
    setTesting(true)
    try {
      const data = await post<{ data: { success: boolean; durationMs: number } }>(
        `/api/v1/admin/key-group-items/${item.id}/test`
      )
      
      // Update test results
      setTestResults(prev => [
        ...(prev || []),
        {
          itemId: item.id,
          success: data.data.success,
          durationMs: data.data.durationMs
        }
      ])
      
      // Update item status if test failed
      if (!data.data.success) {
        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, isDown: true } : i
        ))
      }
    } catch (err: any) {
      setError('测试连接失败: ' + err.message)
    } finally {
      setTesting(false)
    }
  }, [])

  const handleBatchTest = useCallback(async (itemIds: number[]) => {
    if (itemIds.length === 0) return
    
    setTesting(true)
    setTestResults([])
    
    try {
      const results = await Promise.allSettled(
        itemIds.map(async (itemId) => {
          const data = await post<{ data: { success: boolean; durationMs: number } }>(
            `/api/v1/admin/key-group-items/${itemId}/test`
          )
          return {
            itemId,
            success: data.data.success,
            durationMs: data.data.durationMs
          }
        })
      )
      
      const testResults = results
        .filter((result): result is PromiseFulfilledResult<TestResult> => result.status === 'fulfilled')
        .map(result => result.value)
      
      setTestResults(testResults)
      
      // Update items based on test results
      const failedItemIds = testResults
        .filter(result => !result.success)
        .map(result => result.itemId)
      
      if (failedItemIds.length > 0) {
        setItems(prev => prev.map(item =>
          failedItemIds.includes(item.id) ? { ...item, isDown: true } : item
        ))
      }
    } catch (err: any) {
      setError('批量测试失败: ' + err.message)
    } finally {
      setTesting(false)
    }
  }, [])

  return {
    // Data states
    vendors,
    vendorSummaries,
    groups,
    items,
    channels,
    testResults,
    
    // Selection states
    selectedVendorId,
    selectedGroupId,
    selectedIds,
    
    // Filter states
    searchQuery,
    statusTab,
    showDeleted,
    
    // Loading states
    loading,
    itemsLoading,
    channelsLoading,
    testing,
    
    // UI states
    revealedIds,
    editingNotes,
    savingNotes,
    
    // Error state
    error,
    
    // Actions
    setSelectedVendorId,
    setSelectedGroupId,
    setSearchQuery,
    setStatusTab,
    setShowDeleted,
    
    // Data loading
    loadVendors,
    loadGroups,
    loadItems,
    loadChannels,
    
    // Key operations
    toggleSelect,
    toggleAll,
    handleRevealKey,
    handleCopyKey,
    handleToggleItem,
    handleSaveNotes,
    
    // Test operations
    handleTestItem,
    handleBatchTest,
    
    // Calculated values
    filteredItems,
    stats,
    tabCounts
  }
}