import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { VendorModel, Vendor, AdminModel, PaginatedData } from '@/types'
import {
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Edit3,
  Trash2,
  RefreshCw,
  Activity,
  HeartPulse,
  Ban,
  Unlock,
  Cable,
  CheckCircle2,
  Zap,
} from 'lucide-react'

export default function AdminVendorModels() {
  const [items, setItems] = useState<VendorModel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<VendorModel | null>(null)
  const [deleteItem, setDeleteItem] = useState<VendorModel | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
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

  return (
    <div className="space-y-6">
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
                placeholder="搜索供应商、模型或上游名称"
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
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">供应商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">上游名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">接口地址</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">成本价</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">售价</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">权重</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">RPM/TPM</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">健康</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-400">
                    暂无供应商模型映射数据
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{item.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{item.vendorName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.modelName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-mono max-w-[160px] truncate" title={item.upstreamModelName}>
                      {item.upstreamModelName}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono max-w-[180px] truncate" title={item.apiEndpoint}>
                      {item.apiEndpoint}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="text-red-600">入 {Number(item.costPriceInput).toFixed(6)}</span>
                      <br />
                      <span className="text-red-400">出 {Number(item.costPriceOutput).toFixed(6)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className="text-green-600">入 {Number(item.sellPriceInput).toFixed(6)}</span>
                      <br />
                      <span className="text-green-400">出 {Number(item.sellPriceOutput).toFixed(6)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.weight}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.rpmLimit || item.tpmLimit
                        ? `${item.rpmLimit ? `${item.rpmLimit}/m` : '-'}${item.tpmLimit ? ` | ${item.tpmLimit}/m` : ''}`
                        : '-'
                      }
                    </td>
                    <td className="px-4 py-3">
                      {item.isDown ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <Ban size={12} />
                          宕机
                        </span>
                      ) : item.healthScore ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          parseFloat(item.healthScore) >= 80 ? 'bg-green-100 text-green-700' :
                          parseFloat(item.healthScore) >= 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          <HeartPulse size={12} />
                          {Number(item.healthScore).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                          <Activity size={12} />
                          未知
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {item.status ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditItem(item)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                          title="编辑"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteItem(item)}
                          className="text-sm text-red-600 hover:text-red-800"
                          title="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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

      {/* Create Modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); fetchItems() }}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); fetchItems() }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteItem && (
        <DeleteModal
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onSuccess={() => { setDeleteItem(null); fetchItems() }}
        />
      )}
    </div>
  )
}

/* ─── Create Modal ─── */

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [models, setModels] = useState<AdminModel[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    vendorId: '',
    modelId: '',
    upstreamModelName: '',
    apiEndpoint: '',
    apiKey: '',
    costPriceInput: '',
    costPriceOutput: '',
    sellPriceInput: '',
    sellPriceOutput: '',
    weight: '100',
    rpmLimit: '',
    tpmLimit: '',
  })

  useEffect(() => {
    Promise.all([
      get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
      get<any>('/api/v1/admin/models', { page: 1, pageSize: 200 }),
    ])
      .then(([v, m]) => {
        setVendors(v.list || v)
        setModels(m.list || m)
      })
      .catch((err: any) => {
        setMessage('加载选项失败：' + (err.message || ''))
      })
      .finally(() => setLoadingOptions(false))
  }, [])

  const handleSubmit = async () => {
    if (!form.vendorId || !form.modelId || !form.upstreamModelName || !form.apiEndpoint) {
      setMessage('请填写必填字段')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const body: any = {
        vendorId: parseInt(form.vendorId),
        modelId: parseInt(form.modelId),
        upstreamModelName: form.upstreamModelName,
        apiEndpoint: form.apiEndpoint,
        apiKey: form.apiKey || undefined,
        weight: parseInt(form.weight) || 100,
      }
      if (form.costPriceInput) body.costPriceInput = parseFloat(form.costPriceInput)
      if (form.costPriceOutput) body.costPriceOutput = parseFloat(form.costPriceOutput)
      if (form.sellPriceInput) body.sellPriceInput = parseFloat(form.sellPriceInput)
      if (form.sellPriceOutput) body.sellPriceOutput = parseFloat(form.sellPriceOutput)
      if (form.rpmLimit) body.rpmLimit = parseInt(form.rpmLimit)
      if (form.tpmLimit) body.tpmLimit = parseInt(form.tpmLimit)
      await post('/api/v1/admin/vendor-models', body)
      onSuccess()
    } catch (err: any) {
      setMessage('创建失败：' + (err.message || ''))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">新建映射</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
              message.startsWith('创建成功') || message.startsWith('已')
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}>
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          {loadingOptions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    供应商 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.vendorId}
                    onChange={(e) => setForm(f => ({ ...f, vendorId: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">请选择供应商</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    模型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.modelId}
                    onChange={(e) => setForm(f => ({ ...f, modelId: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">请选择模型</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  上游模型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.upstreamModelName}
                  onChange={(e) => setForm(f => ({ ...f, upstreamModelName: e.target.value }))}
                  placeholder="如 gpt-4o-mini"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  API 接口地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.apiEndpoint}
                  onChange={(e) => setForm(f => ({ ...f, apiEndpoint: e.target.value }))}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-xxxxxxxx"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">成本价 (输入)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.costPriceInput}
                    onChange={(e) => setForm(f => ({ ...f, costPriceInput: e.target.value }))}
                    placeholder="0.0"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">成本价 (输出)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.costPriceOutput}
                    onChange={(e) => setForm(f => ({ ...f, costPriceOutput: e.target.value }))}
                    placeholder="0.0"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">售价 (输入)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.sellPriceInput}
                    onChange={(e) => setForm(f => ({ ...f, sellPriceInput: e.target.value }))}
                    placeholder="0.0"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">售价 (输出)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.sellPriceOutput}
                    onChange={(e) => setForm(f => ({ ...f, sellPriceOutput: e.target.value }))}
                    placeholder="0.0"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">权重</label>
                  <input
                    type="number"
                    min="0"
                    value={form.weight}
                    onChange={(e) => setForm(f => ({ ...f, weight: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">RPM 限制</label>
                  <input
                    type="number"
                    min="0"
                    value={form.rpmLimit}
                    onChange={(e) => setForm(f => ({ ...f, rpmLimit: e.target.value }))}
                    placeholder="可选"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">TPM 限制</label>
                  <input
                    type="number"
                    min="0"
                    value={form.tpmLimit}
                    onChange={(e) => setForm(f => ({ ...f, tpmLimit: e.target.value }))}
                    placeholder="可选"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="animate-spin" size={14} />}
                  创建
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Edit Modal ─── */

function EditModal({ item, onClose, onSuccess }: { item: VendorModel; onClose: () => void; onSuccess: () => void }) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [models, setModels] = useState<AdminModel[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    vendorId: item.vendorId.toString(),
    modelId: item.modelId.toString(),
    upstreamModelName: item.upstreamModelName,
    apiEndpoint: item.apiEndpoint,
    costPriceInput: item.costPriceInput,
    costPriceOutput: item.costPriceOutput,
    sellPriceInput: item.sellPriceInput,
    sellPriceOutput: item.sellPriceOutput,
    weight: item.weight.toString(),
    rpmLimit: item.rpmLimit?.toString() || '',
    tpmLimit: item.tpmLimit?.toString() || '',
    status: item.status ? 'true' : 'false',
  })

  useEffect(() => {
    Promise.all([
      get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
      get<any>('/api/v1/admin/models', { page: 1, pageSize: 200 }),
    ])
      .then(([v, m]) => {
        setVendors(v.list || v)
        setModels(m.list || m)
      })
      .catch((err: any) => {
        setMessage('加载选项失败：' + (err.message || ''))
      })
      .finally(() => setLoadingOptions(false))
  }, [])

  const handleSubmit = async () => {
    if (!form.vendorId || !form.modelId || !form.upstreamModelName || !form.apiEndpoint) {
      setMessage('请填写必填字段')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const body: any = {
        vendorId: parseInt(form.vendorId),
        modelId: parseInt(form.modelId),
        upstreamModelName: form.upstreamModelName,
        apiEndpoint: form.apiEndpoint,
        weight: parseInt(form.weight) || 100,
        status: form.status === 'true',
      }
      if (form.costPriceInput) body.costPriceInput = parseFloat(form.costPriceInput)
      if (form.costPriceOutput) body.costPriceOutput = parseFloat(form.costPriceOutput)
      if (form.sellPriceInput) body.sellPriceInput = parseFloat(form.sellPriceInput)
      if (form.sellPriceOutput) body.sellPriceOutput = parseFloat(form.sellPriceOutput)
      if (form.rpmLimit) body.rpmLimit = parseInt(form.rpmLimit)
      if (form.tpmLimit) body.tpmLimit = parseInt(form.tpmLimit)
      await patch(`/api/v1/admin/vendor-models/${item.id}`, body)
      onSuccess()
    } catch (err: any) {
      setMessage('更新失败：' + (err.message || ''))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">编辑映射 #{item.id}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
              message.startsWith('更新成功')
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}>
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          {loadingOptions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    供应商 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.vendorId}
                    onChange={(e) => setForm(f => ({ ...f, vendorId: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">请选择供应商</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    模型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.modelId}
                    onChange={(e) => setForm(f => ({ ...f, modelId: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">请选择模型</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  上游模型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.upstreamModelName}
                  onChange={(e) => setForm(f => ({ ...f, upstreamModelName: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  API 接口地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.apiEndpoint}
                  onChange={(e) => setForm(f => ({ ...f, apiEndpoint: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">API Key</label>
                <input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">创建时已设置，编辑时不可修改</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">成本价 (输入)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.costPriceInput}
                    onChange={(e) => setForm(f => ({ ...f, costPriceInput: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">成本价 (输出)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.costPriceOutput}
                    onChange={(e) => setForm(f => ({ ...f, costPriceOutput: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">售价 (输入)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.sellPriceInput}
                    onChange={(e) => setForm(f => ({ ...f, sellPriceInput: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">售价 (输出)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={form.sellPriceOutput}
                    onChange={(e) => setForm(f => ({ ...f, sellPriceOutput: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">权重</label>
                  <input
                    type="number"
                    min="0"
                    value={form.weight}
                    onChange={(e) => setForm(f => ({ ...f, weight: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">RPM</label>
                  <input
                    type="number"
                    min="0"
                    value={form.rpmLimit}
                    onChange={(e) => setForm(f => ({ ...f, rpmLimit: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">TPM</label>
                  <input
                    type="number"
                    min="0"
                    value={form.tpmLimit}
                    onChange={(e) => setForm(f => ({ ...f, tpmLimit: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">状态</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="true">启用</option>
                    <option value="false">禁用</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="animate-spin" size={14} />}
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Delete Confirmation Modal ─── */

function DeleteModal({ item, onClose, onSuccess }: { item: VendorModel; onClose: () => void; onSuccess: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setMessage('')
    try {
      await del(`/api/v1/admin/vendor-models/${item.id}`)
      onSuccess()
    } catch (err: any) {
      setMessage('删除失败：' + (err.message || ''))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">确认删除</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <p className="text-sm text-slate-600">
            确定要删除供应商 <strong>{item.vendorName || `#${item.vendorId}`}</strong> 下的模型映射
            <strong>{item.upstreamModelName}</strong>（{item.modelName || `#${item.modelId}`}）吗？
            此操作不可撤销。
          </p>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting && <Loader2 className="animate-spin" size={14} />}
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
