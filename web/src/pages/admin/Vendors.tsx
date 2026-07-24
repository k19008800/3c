import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw, Plus, X } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { VendorTable } from './vendors/components'
import { useVendors } from './vendors/hooks'
import { STATUS_OPTIONS } from './vendors/types'
import type { Vendor } from '@/types'

export default function AdminVendors() {
  const { vendors, total, loading, error, fetchVendors, createVendor, updateVendor, deleteVendor } = useVendors()

  const { filters, setFilter } = usePersistedFilters({
    storageKey: 'admin-vendors',
    defaults: { keyword: '', status: '', page: 1, pageSize: 20 },
  })
  const { keyword, status, page, pageSize } = filters as { keyword: string; status: string; page: number; pageSize: number }

  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [deleteVendorConfirm, setDeleteVendorConfirm] = useState<Vendor | null>(null)
  const [form, setForm] = useState({ name: '', baseUrl: '', description: '', status: 'active' })

  useEffect(() => {
    fetchVendors({ keyword, status, page, pageSize })
  }, [keyword, status, page, pageSize, fetchVendors])

  const handleCreate = async () => {
    const v = await createVendor(form)
    if (v) {
      setForm({ name: '', baseUrl: '', description: '', status: 'active' })
      fetchVendors({ keyword, status, page, pageSize })
    }
  }

  const handleDelete = async () => {
    if (!deleteVendorConfirm) return
    const ok = await deleteVendor(deleteVendorConfirm.id)
    if (ok) {
      setDeleteVendorConfirm(null)
      fetchVendors({ keyword, status, page, pageSize })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">供应商管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => fetchVendors({ keyword, status, page, pageSize })}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={() => setEditVendor({} as Vendor)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} />
            新建
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="搜索..."
            value={keyword}
            onChange={(e) => setFilter('keyword', e.target.value)}
            className="px-3 py-1.5 border rounded text-sm w-48"
          />
          <select
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
            className="px-3 py-1.5 border rounded text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无供应商</div>
        ) : (
          <VendorTable
            vendors={vendors}
            onEdit={(v) => setEditVendor(v)}
            onDelete={(v) => setDeleteVendorConfirm(v)}
            onSync={(v) => console.log('Sync:', v.id)}
          />
        )}

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={Math.ceil(total / pageSize)}
            onPageChange={(p) => setFilter('page', p)}
            onPageSizeChange={(s) => setFilter('pageSize', s)}
          />
        </div>
      </div>

      {/* Create/Edit Modal */}
      {editVendor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editVendor.id ? '编辑' : '新建'}供应商</h3>
              <button onClick={() => setEditVendor(null)} className="p-1 hover:bg-slate-100 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">名称</label>
                <input
                  type="text"
                  value={editVendor.id ? editVendor.name : form.name}
                  onChange={(e) => editVendor.id
                    ? setEditVendor({ ...editVendor, name: e.target.value })
                    : setForm({ ...form, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input
                  type="text"
                  value={editVendor.id ? editVendor.baseUrl : form.baseUrl}
                  onChange={(e) => editVendor.id
                    ? setEditVendor({ ...editVendor, baseUrl: e.target.value })
                    : setForm({ ...form, baseUrl: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setEditVendor(null)}
                  className="px-4 py-2 text-sm border rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={editVendor.id
                    ? async () => {
                        await updateVendor(editVendor.id, editVendor)
                        setEditVendor(null)
                        fetchVendors({ keyword, status, page, pageSize })
                      }
                    : handleCreate
                  }
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteVendorConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">确认删除</h3>
            <p className="text-sm text-slate-600 mb-4">
              确定删除供应商 <strong>{deleteVendorConfirm.name}</strong>？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteVendorConfirm(null)}
                className="px-4 py-2 text-sm border rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}