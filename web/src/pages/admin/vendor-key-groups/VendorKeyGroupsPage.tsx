import React, { useEffect, useState } from 'react'
import VendorSelector from './components/VendorSelector'
import GroupList from './components/GroupList'
import KeyItemsTable from './components/KeyItemsTable'
import FiltersPanel from './components/FiltersPanel'
import BatchOperations from './components/BatchOperations'
import GroupDialog from './GroupDialog'
import PaginationBar from '@/components/ui/PaginationBar'
import { useVendorKeyGroups } from './hooks/useVendorKeyGroups'
import { usePagination } from '@/hooks/use-pagination'
import { patch, del } from '@/lib/api'

const VendorKeyGroupsPage: React.FC = () => {
  const pagination = usePagination(20)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showEditGroup, setShowEditGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [showCreateItem, setShowCreateItem] = useState(false)
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({})

  const {
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
  } = useVendorKeyGroups(pagination.page, pagination.pageSize)

  // Load vendors on mount
  useEffect(() => {
    loadVendors()
  }, [])

  // Load groups when vendor changes
  useEffect(() => {
    if (selectedVendorId) {
      loadGroups(selectedVendorId)
      setSelectedGroupId(null)
    }
  }, [selectedVendorId])

  // Load items when group changes
  useEffect(() => {
    if (selectedGroupId) {
      loadItems(selectedGroupId, pagination.page, pagination.pageSize)
      pagination.setTotal(filteredItems.length)
    }
  }, [selectedGroupId, pagination.page, pagination.pageSize])

  const handleVendorSelect = (vendorId: number | null) => {
    if (vendorId) setSelectedVendorId(vendorId)
  }

  const handleGroupSelect = (groupId: number) => {
    setSelectedGroupId(groupId)
  }

  const handleGroupEdit = (group: any) => {
    setEditingGroup(group)
    setShowEditGroup(true)
  }

  const handleGroupDelete = async (group: any) => {
    if (window.confirm(`确定删除分组 "${group.name}"?`)) {
      await del(`/api/v1/admin/vendor-key-groups/${group.id}`)
      loadGroups(selectedVendorId)
    }
  }

  const handleGroupToggle = async (group: any) => {
    await patch(`/api/v1/admin/vendor-key-groups/${group.id}/toggle`, {})
    loadGroups(selectedVendorId)
  }

  const handleItemDelete = async (item: any) => {
    if (window.confirm(`确定删除密钥 #${item.id}?`)) {
      // TODO: Implement item deletion
      console.log('Delete item:', item)
    }
  }

  const handleEditNotes = (itemId: number, notes: string) => {
    setEditingNotes(prev => ({ ...prev, [itemId]: notes }))
  }

  const handleSaveItemNotes = async (itemId: number) => {
    await handleSaveNotes(itemId)
    setEditingNotes(prev => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  const handleBatchEnable = () => {
    // TODO: Implement batch enable
    console.log('Batch enable:', Array.from(selectedIds))
  }

  const handleBatchDisable = () => {
    // TODO: Implement batch disable
    console.log('Batch disable:', Array.from(selectedIds))
  }

  const handleBatchDelete = () => {
    if (window.confirm(`确定删除 ${selectedIds.size} 个选中的密钥?`)) {
      // TODO: Implement batch delete
      console.log('Batch delete:', Array.from(selectedIds))
    }
  }

  const handleBatchExport = () => {
    // TODO: Implement batch export
    console.log('Batch export:', Array.from(selectedIds))
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setStatusTab('all')
    setShowDeleted(false)
  }

  const handleClearSelection = () => {
    // Implement clear selection logic
    // This would typically clear the selectedIds state
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商密钥管理</h1>
        <div className="flex items-center gap-2">
          {selectedGroupId && (
            <button
              onClick={() => setShowCreateItem(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + 创建密钥
            </button>
          )}
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            + 创建分组
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-700 text-sm">{error}</div>
        </div>
      )}

      {/* Vendor selection */}
      <VendorSelector
        vendors={vendors}
        vendorSummaries={vendorSummaries}
        selectedVendorId={selectedVendorId}
        onSelectVendor={handleVendorSelect}
        getVendorSummary={(id) => vendorSummaries.find(s => s.vendorId === id)}
      />

      {/* Group selection and management */}
      {selectedVendorId && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <GroupList
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={handleGroupSelect}
            onEdit={handleGroupEdit}
            onDelete={handleGroupDelete}
            onToggle={handleGroupToggle}
            onCreateGroup={() => setShowCreateGroup(true)}
          />
        </div>
      )}

      {/* Key items management */}
      {selectedGroupId && (
        <>
          {/* Filters */}
          <FiltersPanel
            searchQuery={searchQuery}
            statusTab={statusTab}
            showDeleted={showDeleted}
            tabCounts={tabCounts}
            onSearchChange={setSearchQuery}
            onStatusTabChange={setStatusTab}
            onShowDeletedChange={setShowDeleted}
            onClearFilters={handleClearFilters}
          />

          {/* Batch operations */}
          <BatchOperations
            selectedCount={selectedIds.size}
            testing={testing}
            onBatchTest={() => handleBatchTest(Array.from(selectedIds))}
            onBatchEnable={handleBatchEnable}
            onBatchDisable={handleBatchDisable}
            onBatchDelete={handleBatchDelete}
            onBatchExport={handleBatchExport}
            onClearSelection={handleClearSelection}
          />

          {/* Key items table */}
          <KeyItemsTable
            items={filteredItems}
            selectedIds={selectedIds}
            revealedIds={revealedIds}
            editingNotes={editingNotes}
            savingNotes={savingNotes}
            loading={itemsLoading}
            onSelect={toggleSelect}
            onSelectAll={toggleAll}
            onRevealKey={handleRevealKey}
            onCopyKey={handleCopyKey}
            onToggleItem={handleToggleItem}
            onTestItem={handleTestItem}
            onEditNotes={handleEditNotes}
            onSaveNotes={handleSaveItemNotes}
            onDeleteItem={handleItemDelete}
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <PaginationBar {...pagination.paginationProps} />
          )}

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4 pt-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-sm text-slate-600">总密钥数</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-700">{stats.active}</div>
              <div className="text-sm text-green-600">正常密钥</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-700">{stats.down}</div>
              <div className="text-sm text-red-600">故障密钥</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-700">{stats.disabled}</div>
              <div className="text-sm text-yellow-600">禁用密钥</div>
            </div>
          </div>
        </>
      )}

      {/* Test results */}
      {testResults && testResults.length > 0 && (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h3 className="font-medium text-slate-900 mb-3">测试结果</h3>
          <div className="space-y-2">
            {testResults.map((result, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-2 rounded ${
                  result.success ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                <div>
                  <span className="font-mono text-sm">Key #{result.itemId}</span>
                  {result.success ? (
                    <span className="text-green-700 ml-2">✓ 连接成功</span>
                  ) : (
                    <span className="text-red-700 ml-2">✗ 连接失败</span>
                  )}
                </div>
                <div className="text-sm text-slate-600">
                  耗时: {result.durationMs}ms
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateGroup && (
        <GroupDialog
          mode="create"
          vendorId={selectedVendorId}
          vendorName={vendors.find((v: any) => v.id === selectedVendorId)?.name}
          onClose={() => setShowCreateGroup(false)}
          onSuccess={() => loadGroups(selectedVendorId)}
        />
      )}
      {showEditGroup && editingGroup && (
        <GroupDialog
          mode="edit"
          vendorId={selectedVendorId}
          vendorName={vendors.find((v: any) => v.id === selectedVendorId)?.name}
          group={editingGroup}
          onClose={() => { setShowEditGroup(false); setEditingGroup(null) }}
          onSuccess={() => loadGroups(selectedVendorId)}
        />
      )}
    </div>
  )
}

export default VendorKeyGroupsPage