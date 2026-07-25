import { useState } from 'react'
import { Plus, AlertCircle, Scale } from 'lucide-react'
import { useVendorModels } from './hooks/useVendorModels'
import { useModelActions } from './hooks/useModelActions'
import ModelFilters from './components/ModelFilters'
import ModelList from './components/ModelList'
import ModelStats from './components/ModelStats'
import ModelForm from './components/ModelForm'
import DeleteModal from './components/DeleteModal'
import ModelCompare from './components/ModelCompare'
import type { VendorModel } from '@/types'

export default function VendorModelsPage() {
  const {
    items,
    total,
    page,
    totalPages,
    loading,
    error,
    keyword,
    statusFilter,
    setKeyword,
    setStatusFilter,
    setPage,
    refetch,
  } = useVendorModels()

  const { handleDelete } = useModelActions()

  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<VendorModel | null>(null)
  const [deleteItem, setDeleteItem] = useState<VendorModel | null>(null)
  
  // 对比功能状态
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showCompare, setShowCompare] = useState(false)

  const handleSuccess = () => {
    setShowCreate(false)
    setEditItem(null)
    refetch()
  }

  const handleDeleteConfirm = async () => {
    if (deleteItem) {
      await handleDelete(deleteItem.id)
      setDeleteItem(null)
      refetch()
    }
  }
  
  // 切换选择
  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id)
      }
      // 最多选择 4 个
      if (prev.length >= 4) {
        return prev
      }
      return [...prev, id]
    })
  }
  
  // 清空选择
  const handleClearSelection = () => {
    setSelectedIds([])
    setShowCompare(false)
  }
  
  // 获取选中的模型
  const selectedModels = items.filter(item => selectedIds.includes(item.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商模型映射</h1>
        <div className="flex items-center gap-2">
          {/* 对比按钮 */}
          {selectedIds.length >= 2 && (
            <button
              onClick={() => setShowCompare(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              <Scale size={16} />
              开始对比 ({selectedIds.length})
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            新建映射
          </button>
        </div>
      </div>

      {/* Selection hint */}
      {selectedIds.length > 0 && selectedIds.length < 2 && (
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
          已选择 {selectedIds.length} 个模型，还需选择 {2 - selectedIds.length} 个才能对比
        </div>
      )}
      
      {selectedIds.length >= 2 && (
        <div className="flex items-center justify-between text-sm text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">
          <span>已选择 {selectedIds.length} 个模型，点击"开始对比"查看对比结果</span>
          <button
            onClick={handleClearSelection}
            className="text-purple-700 hover:text-purple-900 underline"
          >
            清空选择
          </button>
        </div>
      )}

      {/* Statistics */}
      <ModelStats items={items} />

      {/* Filters */}
      <ModelFilters
        keyword={keyword}
        statusFilter={statusFilter}
        onKeywordChange={setKeyword}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <ModelList
        items={items}
        loading={loading}
        total={total}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onEdit={(item) => setEditItem(item)}
        onDelete={(item) => setDeleteItem(item)}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />

      {/* Modals */}
      {showCreate && (
        <ModelForm
          mode="create"
          onClose={() => setShowCreate(false)}
          onSuccess={handleSuccess}
        />
      )}

      {editItem && (
        <ModelForm
          mode="edit"
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={handleSuccess}
        />
      )}

      {deleteItem && (
        <DeleteModal
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
      
      {/* Compare Modal */}
      {showCompare && (
        <ModelCompare
          selectedModels={selectedModels}
          onClose={() => setShowCompare(false)}
          onClear={handleClearSelection}
        />
      )}
    </div>
  )
}