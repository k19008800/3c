import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { Vendor, PaginatedData } from '@/types'
import CircuitStatusBadge from '@/components/security/CircuitStatusBadge'
import {
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  CheckCircle2,
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: '正常', className: 'bg-green-100 text-green-700' },
  down: { label: '宕机', className: 'bg-red-100 text-red-700' },
  degraded: { label: '降级', className: 'bg-orange-100 text-orange-700' },
  disabled: { label: '已禁用', className: 'bg-slate-100 text-slate-700' },
}

function getStatusBadge(status: string) {
  return STATUS_MAP[status] || { label: status, className: 'bg-slate-100 text-slate-700' }
}

const emptyForm = { name: '', baseUrl: '', description: '' }

export default function AdminVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Vendor | null>(null)
  const [circuits, setCircuits] = useState<Record<number, string>>({})

  const totalPages = Math.ceil(total / pageSize)

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<Vendor>>('/api/v1/admin/vendors', params)
      setVendors(data.list)
      setTotal(data.total)
      // 获取熔断状态
      try {
        const circuitData = await get<{ list: any[] }>('/api/v1/admin/security/circuits')
        const cmap: Record<number, string> = {}
        circuitData.list.forEach((c: any) => { if (c.state !== 'closed') cmap[c.vendorId] = c.state })
        setCircuits(cmap)
      } catch {}
    } catch (err: any) {
      setError(err.message || '获取供应商列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, statusFilter])

  useEffect(() => {
    fetchVendors()
  }, [fetchVendors])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商管理</h1>
        <button
          onClick={() => { setEditingVendor(null); setModalOpen(true) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          添加供应商
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">搜索</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                placeholder="搜索供应商名称"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="active">正常</option>
              <option value="down">宕机</option>
              <option value="degraded">降级</option>
              <option value="disabled">已禁用</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">接口地址</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">熔断</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">描述</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无供应商数据
                  </td>
                </tr>
              ) : (
                vendors.map((v) => {
                  const badge = getStatusBadge(v.status)
                  return (
                    <tr key={v.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-600">{v.id}</td>
                      <td className="px-4 py-3 text-sm text-slate-900 font-medium">{v.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[240px] truncate" title={v.baseUrl}>
                        {v.baseUrl}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {circuits[v.id] ? (
                          <CircuitStatusBadge state={circuits[v.id]} />
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            ✅ 正常
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate" title={v.description || ''}>
                        {v.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { setEditingVendor(v); setModalOpen(true) }}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(v)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <VendorFormModal
          vendor={editingVendor}
          onClose={() => { setModalOpen(false); setEditingVendor(null) }}
          onSuccess={() => { setModalOpen(false); setEditingVendor(null); fetchVendors() }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          vendor={deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onSuccess={() => { setDeleteConfirm(null); fetchVendors() }}
        />
      )}
    </div>
  )
}

/* ───────── Vendor Form Modal (Create / Edit) ───────── */
function VendorFormModal({
  vendor,
  onClose,
  onSuccess,
}: {
  vendor: Vendor | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = vendor !== null
  const [form, setForm] = useState(
    isEdit
      ? { name: vendor.name, baseUrl: vendor.baseUrl, description: vendor.description || '' }
      : { ...emptyForm }
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setMessage('请输入供应商名称')
      return
    }
    if (!form.baseUrl.trim()) {
      setMessage('请输入接口地址')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      if (isEdit) {
        const body: Record<string, string> = {}
        if (form.name !== vendor.name) body.name = form.name.trim()
        if (form.baseUrl !== vendor.baseUrl) body.baseUrl = form.baseUrl.trim()
        if (form.description !== (vendor.description || '')) body.description = form.description.trim()
        await patch(`/api/v1/admin/vendors/${vendor.id}`, body)
        setMessage('供应商信息已更新')
      } else {
        await post('/api/v1/admin/vendors', {
          name: form.name.trim(),
          baseUrl: form.baseUrl.trim(),
          description: form.description.trim() || undefined,
        })
        setMessage('供应商已创建')
      }
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setMessage((isEdit ? '更新失败：' : '创建失败：') + (err.message || ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEdit ? '编辑供应商' : '添加供应商'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
                message.includes('失败') || message.includes('请输入')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              {message.includes('失败') || message.includes('请输入') ? (
                <AlertCircle size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {message}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：OpenAI"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                接口地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="例如：https://api.openai.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="可选备注"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── Delete Confirmation Modal ───────── */
function DeleteConfirmModal({
  vendor,
  onClose,
  onSuccess,
}: {
  vendor: Vendor
  onClose: () => void
  onSuccess: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setMessage('')
    try {
      await del(`/api/v1/admin/vendors/${vendor.id}`)
      setMessage('供应商已删除')
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setMessage('删除失败：' + (err.message || ''))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">确认删除</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
                message.includes('失败')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              {message.includes('失败') ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              {message}
            </div>
          )}

          <p className="text-sm text-slate-600">
            确定要删除供应商 <span className="font-semibold text-slate-900">{vendor.name}</span> 吗？此操作不可撤销。
          </p>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={deleting}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              确认删除
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
