import { useState } from 'react'
import { Plus, AlertCircle } from 'lucide-react'
import { useVendorModels } from './hooks/useVendorModels'
import { useModelActions } from './hooks/useModelActions'
import ModelFilters from './components/ModelFilters'
import ModelList from './components/ModelList'
import ModelStats from './components/ModelStats'
import ModelForm from './components/ModelForm'
import DeleteModal from './components/DeleteModal'
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商模型映射</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          新建映射
        </button>
      </div>

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
    </div>
  )
}