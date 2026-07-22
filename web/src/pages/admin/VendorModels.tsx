import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, patch } from '@/lib/api'
import type { VendorModel, Vendor, AdminModel, PaginatedData } from '@/types'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Plus, Download } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import FilterBar from '@/components/ui/FilterBar'
import ModelStatsCards from './vendor-models/ModelStatsCards'
import ModelTable from './vendor-models/ModelTable'
import { CreateModal, EditModal, DeleteModal } from './vendor-models/ModelEditForm'

export default function AdminVendorModels() {
  const [items, setItems] = useState<VendorModel[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-vendor-models',
    defaults: { keyword: '', vendorId: '', modelId: '', status: '', page: 1, pageSize: 20 },
  })
  const { keyword, vendorId: vf, modelId: mf, status: sf, page, pageSize } = filters as {
    keyword: string; vendorId: string; modelId: string; status: string; page: number; pageSize: number
  }

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [models, setModels] = useState<AdminModel[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<VendorModel | null>(null)
  const [deleteItem, setDeleteItem] = useState<VendorModel | null>(null)

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  const summary = useMemo(() => ({
    total,
    active: items.filter(i => i.status && !i.isDown).length,
    down: items.filter(i => i.isDown).length,
    disabled: items.filter(i => !i.status).length,
  }), [items, total])

  useEffect(() => {
    Promise.all([
      get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
      get<any>('/api/v1/admin/models', { page: 1, pageSize: 200 }),
    ]).then(([v, m]) => {
      setVendors(Array.isArray(v?.list) ? v.list : [])
      setModels(Array.isArray(m?.list) ? m.list : [])
    }).catch(() => {})
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (vf) params.vendorId = vf
      if (mf) params.modelId = mf
      if (sf) params.status = sf
      const data = await get<PaginatedData<VendorModel>>('/api/v1/admin/vendor-models', params)
      setItems(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取供应商模型映射列表失�?)
    } finally { setLoading(false) }
  }, [page, pageSize, keyword, vf, mf, sf])

  useEffect(() => { fetchItems() }, [fetchItems])

  const toggleStatus = useCallback(async (item: VendorModel) => {
    try {
      const s = !item.status
      await patch(`/api/v1/admin/vendor-models/${item.id}`, { status: s })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: s } : i))
    } catch (err: any) {
      setError(err.message || '状态切换失�?)
    }
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const params: Record<string, any> = { page: 1, pageSize: 10000 }
      if (keyword) params.keyword = keyword
      if (vf) params.vendorId = vf
      if (mf) params.modelId = mf
      if (sf) params.status = sf
      const data = await get<PaginatedData<VendorModel>>('/api/v1/admin/vendor-models', params)
      const rows = [
        ['ID','供应�?,'模型','上游名称','接口地址','成本价入','成本价出','售价�?,'售价�?,'权重','RPM','TPM','健康�?,'宕机','状�?],
        ...data.list.map(i => [i.id, i.vendorName??'', i.modelName??'', i.upstreamModelName, i.apiEndpoint,
          i.costPriceInput, i.costPriceOutput, i.sellPriceInput, i.sellPriceOutput,
          i.weight, i.rpmLimit??'', i.tpmLimit??'', i.healthScore??'', i.isDown?'�?:'�?, i.status?'启用':'禁用']),
      ]
      const bom = '\uFEFF'
      const csv = bom + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `vendor-models-${new Date().toISOString().slice(0, 10)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch (err: any) {
      setError('导出失败�? + (err.message || ''))
    }
  }, [keyword, vf, mf, sf])

  const vendorOptions = useMemo(() => [
    { value: '', label: '全部供应�? },
    ...vendors.map(v => ({ value: String(v.id), label: v.name })),
  ], [vendors])

  const modelOptions = useMemo(() => [
    { value: '', label: '全部模型' },
    ...models.map(m => ({ value: String(m.id), label: m.displayName || m.name })),
  ], [models])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商模型映�?/h1>
        <FeatureDescription page="admin/vendor-models" className="ml-2" />
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition">
            <Download size={16} />导出 CSV
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            <Plus size={16} />新建映射
          </button>
        </div>
      </div>

      <ModelStatsCards total={summary.total} active={summary.active} down={summary.down} disabled={summary.disabled} loading={loading} />

      <FilterBar
        filters={{ keyword, vendorId: vf, modelId: mf, status: sf }}
        setFilter={(k, v) => setFilter(k as any, v)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchItems}
        fields={[
          { key: 'keyword', label: '搜索', type: 'text', placeholder: '搜索供应商、模型或上游名称' },
          { key: 'vendorId', label: '供应�?, type: 'select', options: vendorOptions },
          { key: 'modelId', label: '模型', type: 'select', options: modelOptions },
          { key: 'status', label: '状�?, type: 'select', options: [
            { value: '', label: '全部' }, { value: 'true', label: '启用' }, { value: 'false', label: '禁用' },
          ]},
        ]}
      />

      <ModelTable
        items={items} loading={loading} error={error}
        page={page} pageSize={pageSize} total={total} totalPages={totalPages}
        onEdit={setEditItem} onDelete={setDeleteItem} onToggleStatus={toggleStatus}
        onPageChange={p => setFilter('page', p)}
        onPageSizeChange={s => setFilters({ pageSize: s })}
      />

      {showCreate && (
        <CreateModal vendors={vendors} models={models} existingItems={items}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); fetchItems() }} />
      )}
      {editItem && (
        <EditModal item={editItem} vendors={vendors} models={models}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); fetchItems() }} />
      )}
      {deleteItem && (
        <DeleteModal item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onSuccess={() => { setDeleteItem(null); fetchItems() }} />
      )}
    </div>
  )
}
