import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AdminModel, PaginatedData } from '@/types'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Plus } from 'lucide-react'
import ModelStatsCards from './admin-models/ModelStatsCards'
import ModelList from './admin-models/ModelList'
import ModelForm from './admin-models/ModelForm'
import type { ModelFilters } from './admin-models/types'

export default function AdminModels() {
  const [models, setModels] = useState<AdminModel[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { filters, setFilter, resetFilters, hasActiveFilters } = usePersistedFilters<ModelFilters>(
    {
      storageKey: 'admin-models',
      defaults: { keyword: '', type: '', status: '', page: 1, pageSize: 20 },
    }
  )
  const { keyword, type: typeFilter, status: statusFilter, page, pageSize } = filters

  const [showFormModal, setShowFormModal] = useState(false)
  const [editingModel, setEditingModel] = useState<AdminModel | null>(null)
  const [saving, setSaving] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, unknown> = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (typeFilter) params.type = typeFilter
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<AdminModel>>('/api/v1/admin/models', params)
      setModels(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取模型列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, typeFilter, statusFilter])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const handleEdit = useCallback((model: AdminModel) => {
    setEditingModel(model)
    setShowFormModal(true)
  }, [])

  const handleFormSaved = useCallback(() => {
    setShowFormModal(false)
    setEditingModel(null)
    fetchModels()
  }, [fetchModels])

  const handleFormClose = useCallback(() => {
    setShowFormModal(false)
    setEditingModel(null)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">模型管理</h1>
        <FeatureDescription page="admin/models" className="ml-2" />
        <button
          onClick={() => {
            setEditingModel(null)
            setShowFormModal(true)
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          新增模型
        </button>
      </div>

      {/* Stats Cards */}
      <ModelStatsCards models={models} loading={loading} total={total} />

      {/* Table + Filters + Pagination */}
      <ModelList
        models={models}
        loading={loading}
        error={error}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        keyword={keyword}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        setFilter={setFilter as (key: string, value: unknown) => void}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchModels}
        onEdit={handleEdit}
        onRefresh={fetchModels}
      />

      {/* Create / Edit Modal */}
      {showFormModal && (
        <ModelForm
          model={editingModel}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
          saving={saving}
          setSaving={setSaving}
        />
      )}
    </div>
  )
}
