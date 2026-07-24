import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { get, post, patch, del } from '@/lib/api'
import { usePagination } from '@/hooks/use-pagination'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import type { Vendor } from '@/types'
import React from 'react'
import {
  Plus, Edit3, Trash2, Cable, CheckCircle2, AlertCircle, Loader2,
  DollarSign, RefreshCw, ToggleLeft, ToggleRight, Eye, EyeOff,
  Search, Download, FileText, Copy, X, Info,
  Square, CheckSquare,
} from 'lucide-react'
import KeyModelPricesModal from './KeyModelPricesModal'
import {
  VendorSelector,
  GroupList,
  KeyTable,
  KeyFilters,
  type StatusTab,
  type KeyGroup,
  type KeyItem,
} from './vendor-key-groups/components'

interface VendorSummary {
  vendorId: number
  vendorName: string
  groupCount: number
  keyCount: number
}

interface ChannelRef {
  id: number
  vendorId: number
  vendorName: string
  modelId: number
  modelName: string
  upstreamModelName: string
  status: boolean
  isDown: boolean
}

interface TestResult {
  itemId: number
  success: boolean
  durationMs: number
  statusCode?: number
  error?: string
}

function VendorKeyGroupsBaseImpl() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorSummaries, setVendorSummaries] = useState<VendorSummary[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null)
  const [groups, setGroups] = useState<KeyGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [items, setItems] = useState<KeyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error, setError] = useState('')

  const pagination = usePagination(20)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [showDeleted, setShowDeleted] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Record<number, string>>({})
  const [revealing, setRevealing] = useState<number | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({})
  const [savingNotes, setSavingNotes] = useState<Record<number, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchTestingItems, setBatchTestingItems] = useState<number[]>([])
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [editGroup, setEditGroup] = useState<KeyGroup | null>(null)
  const [groupForm, setGroupForm] = useState({ name: '', strategy: 'round_robin', description: '' })
  const [groupSubmitting, setGroupSubmitting] = useState(false)

  const [showCreateItem, setShowCreateItem] = useState(false)
  const [editItem, setEditItem] = useState<KeyItem | null>(null)
  const [itemForm, setItemForm] = useState({
    apiKey: '', weight: 1, priority: 0, notes: '',
    costPriceInput: '', costPriceOutput: '', sellPriceInput: '', sellPriceOutput: '',
  })
  const [itemSubmitting, setItemSubmitting] = useState(false)

  const [priceConfigItem, setPriceConfigItem] = useState<{ itemId: number; groupId: number; prefix: string | null } | null>(null)

  // Load vendors
  useEffect(() => {
    Promise.all([
      get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
      get<VendorSummary[]>('/api/v1/admin/vendors/key-group-summary'),
    ]).then(([vData, summaryData]) => {
      setVendors(Array.isArray(vData?.list) ? vData.list : [])
      setVendorSummaries(Array.isArray(summaryData) ? summaryData : [])
    }).catch(() => {})
  }, [])

  const loadGroups = useCallback(async (vendorId: number) => {
    setLoading(true)
    setError('')
    try {
      const data = await get<KeyGroup[]>(`/api/v1/admin/vendors/${vendorId}/key-groups`)
      setGroups(data || [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally { setLoading(false) }
  }, [])

  const loadItems = useCallback(async (groupId: number) => {
    setItemsLoading(true)
    try {
      const params: any = { page: pagination.page, pageSize: pagination.pageSize }
      if (showDeleted) params.showDeleted = 'true'
      const data = await get<{ items: KeyItem[]; total: number; page: number; pageSize: number }>(
        `/api/v1/admin/key-groups/${groupId}/items`, params)
      setItems(data.items || [])
      pagination.setTotal(data.total ?? 0)
    } catch (err: any) {
      setError(err.message || '加载Key列表失败')
    } finally { setItemsLoading(false) }
  }, [showDeleted, pagination.page, pagination.pageSize])

  useEffect(() => {
    if (selectedVendorId) { setSelectedGroupId(null); setItems([]); loadGroups(selectedVendorId) }
  }, [selectedVendorId])

  const [groupLoadKey, setGroupLoadKey] = useState(0)
  useEffect(() => {
    if (selectedGroupId) {
      loadItems(selectedGroupId)
    }
  }, [selectedGroupId, pagination.page, pagination.pageSize, groupLoadKey])

  const prevGroupRef = useRef<number | null>(null)
  useEffect(() => {
    if (selectedGroupId) {
      if (prevGroupRef.current !== selectedGroupId) {
        prevGroupRef.current = selectedGroupId
        pagination.resetPage()
        setGroupLoadKey(k => k + 1)
      }
    }
  }, [selectedGroupId])

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)
  const selectedGroup = groups.find(g => g.id === selectedGroupId)

  const getVendorSummary = useCallback((vendorId: number) => {
    return vendorSummaries.find(s => s.vendorId === vendorId)
  }, [vendorSummaries])

  const filteredItems = useMemo(() => {
    let list = items
    if (statusTab === 'active') list = list.filter(i => i.status && !i.isDown && !i.deletedAt)
    else if (statusTab === 'down') list = list.filter(i => i.isDown && !i.deletedAt)
    else if (statusTab === 'disabled') list = list.filter(i => !i.status && !i.deletedAt)
    else if (statusTab === 'deleted') list = list.filter(i => i.deletedAt)
    else if (statusTab === 'all') list = list.filter(i => !i.deletedAt)

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

  const tabCounts = useMemo(() => {
    const all = items.filter(i => !i.deletedAt).length
    const active = items.filter(i => i.status && !i.isDown && !i.deletedAt).length
    const down = items.filter(i => i.isDown && !i.deletedAt).length
    const disabled = items.filter(i => !i.status && !i.deletedAt).length
    const deleted = items.filter(i => i.deletedAt).length
    return { all, active, down, disabled, deleted }
  }, [items])

  const allSelected = useMemo(() => {
    if (filteredItems.length === 0) return false
    return filteredItems.every(i => selectedIds.has(i.id))
  }, [filteredItems, selectedIds])

  const handleCreateGroup = async () => {
    if (!selectedVendorId || !groupForm.name) return
    setGroupSubmitting(true)
    try {
      await post(`/api/v1/admin/vendors/${selectedVendorId}/key-groups`, groupForm)
      setShowCreateGroup(false)
      setGroupForm({ name: '', strategy: 'round_robin', description: '' })
      loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
    finally { setGroupSubmitting(false) }
  }

  const handleUpdateGroup = async () => {
    if (!editGroup) return
    setGroupSubmitting(true)
    try {
      await patch(`/api/v1/admin/key-groups/${editGroup.id}`, {
        name: groupForm.name, strategy: groupForm.strategy, description: groupForm.description || null,
      })
      setEditGroup(null)
      setGroupForm({ name: '', strategy: 'round_robin', description: '' })
      if (selectedVendorId) loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
    finally { setGroupSubmitting(false) }
  }

  const handleDeleteGroup = async (g: KeyGroup) => {
    if (!confirm(`确定删除分组「${g.name}」?`)) return
    try {
      await del(`/api/v1/admin/key-groups/${g.id}`)
      if (selectedGroupId === g.id) { setSelectedGroupId(null); setItems([]) }
      if (selectedVendorId) loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
  }

  const handleToggleGroup = async (g: KeyGroup) => {
    try {
      await patch(`/api/v1/admin/key-groups/${g.id}`, { status: !g.status })
      if (selectedVendorId) loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
  }

  const openCreateItem = () => {
    setEditItem(null)
    setItemForm({
      apiKey: '', weight: 1, priority: 0, notes: '',
      costPriceInput: '', costPriceOutput: '', sellPriceInput: '', sellPriceOutput: '',
    })
    setShowCreateItem(true)
  }

  const openEditItem = (item: KeyItem) => {
    setEditItem(item)
    setItemForm({
      apiKey: '',
      weight: item.weight, priority: item.priority, notes: item.notes ?? '',
      costPriceInput: item.costPriceInput ?? '', costPriceOutput: item.costPriceOutput ?? '',
      sellPriceInput: item.sellPriceInput ?? '', sellPriceOutput: item.sellPriceOutput ?? '',
    })
    setShowCreateItem(true)
  }

  const handleSaveItem = async () => {
    if (!selectedGroupId) return
    setItemSubmitting(true)
    try {
      const body: any = {
        weight: itemForm.weight, priority: itemForm.priority,
        notes: itemForm.notes || null,
      }
      if (itemForm.costPriceInput) body.costPriceInput = parseFloat(itemForm.costPriceInput)
      if (itemForm.costPriceOutput) body.costPriceOutput = parseFloat(itemForm.costPriceOutput)
      if (itemForm.sellPriceInput) body.sellPriceInput = parseFloat(itemForm.sellPriceInput)
      if (itemForm.sellPriceOutput) body.sellPriceOutput = parseFloat(itemForm.sellPriceOutput)

      if (editItem) {
        await patch(`/api/v1/admin/key-group-items/${editItem.id}`, body)
      } else {
        body.apiKey = itemForm.apiKey
        await post(`/api/v1/admin/key-groups/${selectedGroupId}/items`, body)
      }
      setShowCreateItem(false)
      setEditItem(null)
      setItemForm({
        apiKey: '', weight: 1, priority: 0, notes: '',
        costPriceInput: '', costPriceOutput: '', sellPriceInput: '', sellPriceOutput: '',
      })
      loadItems(selectedGroupId)
    } catch (err: any) { setError(err.message) }
    finally { setItemSubmitting(false) }
  }

  const handleDeleteItem = async (item: KeyItem) => {
    if (!confirm(`确定删除 Key #${item.id}（${item.apiKeyPrefix || ''}）?`)) return
    try {
      await del(`/api/v1/admin/key-group-items/${item.id}`)
      loadItems(selectedGroupId!)
    } catch (err: any) { setError(err.message) }
  }

  const handleToggleItem = async (item: KeyItem) => {
    try {
      await patch(`/api/v1/admin/key-group-items/${item.id}`, { status: !item.status })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: !i.status } : i))
    } catch (err: any) { setError(err.message) }
  }

  const handleRevealKey = async (item: KeyItem) => {
    if (revealedIds[item.id]) {
      setRevealedIds(prev => { const n = { ...prev }; delete n[item.id]; return n })
      return
    }
    setRevealing(item.id)
    try {
      const data = await post<{ data: { fullKey: string } }>(`/api/v1/admin/key-group-items/${item.id}/reveal`)
      setRevealedIds(prev => ({ ...prev, [item.id]: data.data.fullKey }))
      setTimeout(() => {
        setRevealedIds(prev => { const n = { ...prev }; delete n[item.id]; return n })
      }, 30000)
    } catch (err: any) {
      setError('查看完整 Key 失败: ' + err.message)
    } finally { setRevealing(null) }
  }

  const handleCopyKey = async (fullKey: string) => {
    try {
      await navigator.clipboard.writeText(fullKey)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = fullKey; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
  }

  const handleSaveNotes = async (itemId: number) => {
    const notes = editingNotes[itemId]
    if (notes === undefined) return
    setSavingNotes(prev => ({ ...prev, [itemId]: true }))
    try {
      await patch(`/api/v1/admin/key-group-items/${itemId}`, { notes: notes || null })
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes: notes || null } : i))
      setEditingNotes(prev => { const n = { ...prev }; delete n[itemId]; return n })
    } catch (err: any) {
      setError('保存备注失败: ' + err.message)
    } finally { setSavingNotes(prev => ({ ...prev, [itemId]: false })) }
  }

  const handleTestItem = async (item: KeyItem) => {
    try {
      const data = await post<{ data: { success: boolean; durationMs: number } }>(
        `/api/v1/admin/key-group-items/${item.id}/test`)
      alert(data.data.success ? `连接成功 (${data.data.durationMs}ms)` : `连接失败 (${data.data.durationMs}ms)`)
    } catch (err: any) { alert('测试失败: ' + err.message) }
  }

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)))
    }
  }

  const handleSelectItem = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Key 分组管理</h1>
        <FeatureDescription page="admin/vendor-key-groups" className="ml-2" />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm bg-red-50 text-red-600 rounded-lg">
          <AlertCircle size={16} />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      <VendorSelector
        vendors={vendors}
        vendorSummaries={vendorSummaries}
        selectedVendorId={selectedVendorId}
        onSelectVendor={setSelectedVendorId}
        getVendorSummary={getVendorSummary}
      />

      {selectedVendor && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <GroupList
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onToggle={handleToggleGroup}
            onEdit={(g: any) => { setEditGroup(g); setGroupForm({ name: g.name, strategy: g.strategy, description: g.description ?? '' }); setShowCreateGroup(true) }}
            onDelete={handleDeleteGroup}
            onCreateGroup={() => { setEditGroup(null); setGroupForm({ name: '', strategy: 'round_robin', description: '' }); setShowCreateGroup(true) }}
          />

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">
                {selectedGroupId ? (selectedGroup?.name ?? `资源池 #${selectedGroupId}`) : 'Key 列表'}
              </h2>
              <div className="flex items-center gap-1">
                {selectedGroupId && (
                  <>
                    <button onClick={openCreateItem}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      <Plus size={14} />新增 Key
                    </button>
                  </>
                )}
              </div>
            </div>

            {!selectedGroupId ? (
              <div className="text-center py-8 text-slate-400 text-sm">请先选择一个资源池</div>
            ) : itemsLoading ? (
              <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
                <Info size={32} className="text-slate-300" />
                <p className="text-sm">该资源池暂无 Key</p>
                <button onClick={openCreateItem}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus size={14} />新增 Key
                </button>
              </div>
            ) : (
              <>
                <KeyFilters
                  tabCounts={tabCounts}
                  statusTab={statusTab}
                  onTabChange={setStatusTab}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />

                <KeyTable
                  items={items}
                  filteredItems={filteredItems}
                  hasSelectedGroup={!!selectedGroupId}
                  itemsLoading={itemsLoading}
                  selectedIds={selectedIds}
                  revealedIds={revealedIds}
                  revealing={revealing}
                  editingNotes={editingNotes}
                  savingNotes={savingNotes}
                  batchTestingItems={batchTestingItems}
                  tableScrollRef={tableScrollRef}
                  onSelectItem={handleSelectItem}
                  onSelectAll={handleSelectAll}
                  onRevealKey={handleRevealKey}
                  onCopyKey={handleCopyKey}
                  onToggleItem={handleToggleItem}
                  onTestItem={handleTestItem}
                  onPriceConfig={(item) => setPriceConfigItem({
                    itemId: item.id, groupId: selectedGroupId!, prefix: item.apiKeyPrefix
                  })}
                  onEditItem={openEditItem}
                  onDeleteItem={handleDeleteItem}
                  onNotesChange={(itemId, notes) => setEditingNotes(prev => ({ ...prev, [itemId]: notes }))}
                  onSaveNotes={handleSaveNotes}
                  onCancelEditNotes={(itemId) => setEditingNotes(prev => { const n = { ...prev }; delete n[itemId]; return n })}
                />

                <PaginationBar {...pagination.paginationProps} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Group Modal */}
      {(showCreateGroup || editGroup) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowCreateGroup(false); setEditGroup(null) }}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editGroup ? '编辑资源池' : '新建资源池'}</h2>
                <button onClick={() => { setShowCreateGroup(false); setEditGroup(null) }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">名称 <span className="text-red-500">*</span></label>
                  <input type="text" value={groupForm.name}
                    onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="如 资源池1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">路由策略</label>
                  <select value={groupForm.strategy}
                    onChange={e => setGroupForm(f => ({ ...f, strategy: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="round_robin">轮询 (round_robin)</option>
                    <option value="weighted">加权 (weighted)</option>
                    <option value="failover">故障转移 (failover)</option>
                    <option value="priority">优先级 (priority)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">描述</label>
                  <input type="text" value={groupForm.description}
                    onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="可选"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setShowCreateGroup(false); setEditGroup(null) }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
                <button onClick={editGroup ? handleUpdateGroup : handleCreateGroup} disabled={groupSubmitting || !groupForm.name}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {groupSubmitting && <Loader2 className="animate-spin" size={14} />}
                  {editGroup ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <KeyModelPricesModal
        itemId={priceConfigItem?.itemId ?? 0}
        groupId={priceConfigItem?.groupId ?? 0}
        apiKeyPrefix={priceConfigItem?.prefix ?? null}
        open={priceConfigItem != null}
        onClose={() => setPriceConfigItem(null)}
        onSaved={() => { if (selectedGroupId) loadItems(selectedGroupId) }}
      />

      {showCreateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateItem(false)}>
          <div className="bg-white rounded-xl w-full max-w-xl shadow-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editItem ? '编辑 Key' : '新增 Key'}</h2>
                <button onClick={() => setShowCreateItem(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>

              {!editItem && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">API Key <span className="text-red-500">*</span></label>
                  <input type="password" value={itemForm.apiKey}
                    onChange={e => setItemForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">权重</label>
                  <input type="number" min="0" value={itemForm.weight}
                    onChange={e => setItemForm(f => ({ ...f, weight: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">优先级</label>
                  <input type="number" min="0" value={itemForm.priority}
                    onChange={e => setItemForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">备注（用于与第三方核对时做标记）</label>
                <input type="text" value={itemForm.notes}
                  onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="如：旧 Key，3 月申请"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                <p className="text-xs font-medium text-slate-500">价格设置（可选，留空则沿用通道配置）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">成本价 (输入)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.costPriceInput}
                      onChange={e => setItemForm(f => ({ ...f, costPriceInput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">成本价 (输出)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.costPriceOutput}
                      onChange={e => setItemForm(f => ({ ...f, costPriceOutput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">售价 (输入)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.sellPriceInput}
                      onChange={e => setItemForm(f => ({ ...f, sellPriceInput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">售价 (输出)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.sellPriceOutput}
                      onChange={e => setItemForm(f => ({ ...f, sellPriceOutput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowCreateItem(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
                <button onClick={handleSaveItem} disabled={itemSubmitting || (!editItem && !itemForm.apiKey)}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {itemSubmitting && <Loader2 className="animate-spin" size={14} />}
                  {editItem ? '保存' : '新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const VendorKeyGroupsBase = React.memo(VendorKeyGroupsBaseImpl)
export default VendorKeyGroupsBase