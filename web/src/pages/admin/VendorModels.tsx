import { useEffect, useState, useCallback, useMemo } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { VendorModel, Vendor, AdminModel, PaginatedData } from '@/types'
import { Link } from 'react-router-dom'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2,
  AlertCircle,
  Search,
  Plus,
  Edit3,
  Trash2,
  HeartPulse,
  Ban,
  Cable,
  CheckCircle2,
  Download,
  Copy,
  Activity,
} from 'lucide-react'

// ── helpers ──

function fmtPrice(val: string | number): string {
  const n = Number(val)
  if (n === 0) return '—'
  if (n < 0.0001) return '<0.0001'
  return n.toFixed(4)
}

function fullPrice(val: string | number): string {
  return Number(val).toFixed(6)
}

// ── component ──

export default function AdminVendorModels() {
  const [items, setItems] = useState<VendorModel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // filters
  const [keyword, setKeyword] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // dropdown options
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [models, setModels] = useState<AdminModel[]>([])

  // modals
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<VendorModel | null>(null)
  const [deleteItem, setDeleteItem] = useState<VendorModel | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  // load dropdowns once
  useEffect(() => {
    Promise.all([
      get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
      get<any>('/api/v1/admin/models', { page: 1, pageSize: 200 }),
    ])
      .then(([v, m]) => {
        setVendors(Array.isArray(v?.list) ? v.list : [])
        setModels(Array.isArray(m?.list) ? m.list : [])
      })
      .catch(() => {})
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (vendorFilter) params.vendorId = vendorFilter
      if (modelFilter) params.modelId = modelFilter
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<VendorModel>>('/api/v1/admin/vendor-models', params)
      setItems(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取供应商模型映射列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, vendorFilter, modelFilter, statusFilter])

  useEffect(() => { fetchItems() }, [fetchItems])

  // ── summary cards ──
  const summary = useMemo(() => ({
    total,
    active: items.filter(i => i.status && !i.isDown).length,
    down: items.filter(i => i.isDown).length,
    disabled: items.filter(i => !i.status).length,
  }), [items, total])

  // ── inline status toggle ──
  const toggleStatus = async (item: VendorModel) => {
    try {
      const newStatus = !item.status
      await patch(`/api/v1/admin/vendor-models/${item.id}`, { status: newStatus })
      // optimistic update
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    } catch (err: any) {
      setError(err.message || '状态切换失败')
    }
  }

  // ── CSV export ──
  const handleExport = async () => {
    try {
      const params: any = { page: 1, pageSize: 10000 }
      if (keyword) params.keyword = keyword
      if (vendorFilter) params.vendorId = vendorFilter
      if (modelFilter) params.modelId = modelFilter
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<VendorModel>>('/api/v1/admin/vendor-models', params)
      const rows = [
        ['ID', '供应商', '模型', '上游名称', '接口地址', '成本价入', '成本价出', '售价入', '售价出', '权重', 'RPM', 'TPM', '健康分', '宕机', '状态'],
        ...data.list.map(i => [
          i.id,
          i.vendorName ?? '',
          i.modelName ?? '',
          i.upstreamModelName,
          i.apiEndpoint,
          i.costPriceInput,
          i.costPriceOutput,
          i.sellPriceInput,
          i.sellPriceOutput,
          i.weight,
          i.rpmLimit ?? '',
          i.tpmLimit ?? '',
          i.healthScore ?? '',
          i.isDown ? '是' : '否',
          i.status ? '启用' : '禁用',
        ])
      ]
      const bom = '\uFEFF'
      const csv = bom + rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vendor-models-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError('导出失败：' + (err.message || ''))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商模型映射</h1>
        <FeatureDescription page="admin/vendor-models" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={16} />
            导出 CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            新建映射
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-1">总映射数</p>
          <p className="text-2xl font-bold text-slate-900">{summary.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-1">正常</p>
          <p className="text-2xl font-bold text-green-600">{summary.active}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-1">宕机</p>
          <p className="text-2xl font-bold text-red-600">{summary.down}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500 mb-1">已禁用</p>
          <p className="text-2xl font-bold text-slate-400">{summary.disabled}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
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
            <label className="block text-xs text-slate-500 mb-1">供应商</label>
            <select
              value={vendorFilter}
              onChange={(e) => { setVendorFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部供应商</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">模型</label>
            <select
              value={modelFilter}
              onChange={(e) => { setModelFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部模型</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
          </div>
          <button
            onClick={() => { setKeyword(''); setVendorFilter(''); setModelFilter(''); setStatusFilter(''); setPage(1) }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            重置
          </button>
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
                <th className="px-3 py-3 text-sm font-medium text-slate-500 w-12">ID</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">供应商</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">模型</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">上游名称</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500 hidden xl:table-cell">接口地址</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">成本价</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">售价</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">权重</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">RPM/TPM</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">健康</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-3 py-3 text-sm font-medium text-slate-500">操作</th>
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
                    <td className="px-3 py-3 text-sm text-slate-400">{item.id}</td>
                    <td className="px-3 py-3 text-sm text-slate-900">
                      <Link
                        to={`/admin/vendors`}
                        className="hover:text-blue-600 hover:underline transition"
                        title="查看供应商详情"
                      >
                        {item.vendorName || `#${item.vendorId}`}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      <Link
                        to={`/admin/models`}
                        className="hover:text-blue-600 hover:underline transition"
                        title="查看模型详情"
                      >
                        {item.modelName || `#${item.modelId}`}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700 font-mono max-w-[140px] truncate" title={item.upstreamModelName}>
                      {item.upstreamModelName}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-400 font-mono max-w-[160px] truncate hidden xl:table-cell" title={item.apiEndpoint}>
                      {item.apiEndpoint}
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">
                      <span className="text-red-600" title={fullPrice(item.costPriceInput)}>
                        入 {fmtPrice(item.costPriceInput)}
                      </span>
                      <br />
                      <span className="text-red-400" title={fullPrice(item.costPriceOutput)}>
                        出 {fmtPrice(item.costPriceOutput)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">
                      <span className="text-green-600" title={fullPrice(item.sellPriceInput)}>
                        入 {fmtPrice(item.sellPriceInput)}
                      </span>
                      <br />
                      <span className="text-green-400" title={fullPrice(item.sellPriceOutput)}>
                        出 {fmtPrice(item.sellPriceOutput)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">{item.weight}</td>
                    <td className="px-3 py-3 text-sm text-slate-500">
                      {item.rpmLimit || item.tpmLimit
                        ? `${item.rpmLimit ? `${item.rpmLimit}/m` : '—'}${item.tpmLimit ? ` | ${item.tpmLimit}/m` : ''}`
                        : '—'
                      }
                    </td>
                    <td className="px-3 py-3">
                      {item.isDown ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <Ban size={12} />
                          宕机
                        </span>
                      ) : item.healthScore != null ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          Number(item.healthScore) >= 0.8 ? 'bg-green-100 text-green-700' :
                          Number(item.healthScore) >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          <HeartPulse size={12} />
                          {(Number(item.healthScore) * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                          <Activity size={12} />
                          未知
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {/* inline toggle switch */}
                      <button
                        onClick={() => toggleStatus(item)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                          item.status ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                        title={item.status ? '点击禁用' : '点击启用'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                            item.status ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <TestButton vendorModelId={item.id} />
                        <button
                          onClick={() => setEditItem(item)}
                          className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition"
                          title="编辑"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteItem(item)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                          title="下架"
                        >
                          <Trash2 size={14} />
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
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateModal
          vendors={vendors}
          models={models}
          existingItems={items}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); fetchItems() }}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <EditModal
          item={editItem}
          vendors={vendors}
          models={models}
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

/* ─── Test Connectivity Button ─── */

function TestButton({ vendorModelId }: { vendorModelId: number }) {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [latency, setLatency] = useState<number | null>(null)

  const handleTest = async () => {
    setState('testing')
    const start = Date.now()
    try {
      await post('/api/v1/admin/vendor-models/test', { vendorModelId })
      setLatency(Date.now() - start)
      setState('ok')
    } catch {
      setLatency(Date.now() - start)
      setState('fail')
    }
    // reset after 3s
    setTimeout(() => setState('idle'), 3000)
  }

  if (state === 'testing') {
    return <Loader2 size={14} className="animate-spin text-slate-400" />
  }
  if (state === 'ok') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-600" title={`延迟 ${latency}ms`}>
        <CheckCircle2 size={14} />
        {latency}ms
      </span>
    )
  }
  if (state === 'fail') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-500" title={`${latency}ms 超时/失败`}>
        <AlertCircle size={14} />
        失败
      </span>
    )
  }

  return (
    <button
      onClick={handleTest}
      className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition"
      title="测试连通性"
    >
      <Cable size={14} />
    </button>
  )
}

/* ─── Create Modal ─── */

function CreateModal({
  vendors,
  models,
  existingItems,
  onClose,
  onSuccess,
}: {
  vendors: Vendor[]
  models: AdminModel[]
  existingItems: VendorModel[]
  onClose: () => void
  onSuccess: () => void
}) {
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

  // ── 利润预览 ──
  const profitMargin = useMemo(() => {
    const ci = parseFloat(form.costPriceInput) || 0
    const co = parseFloat(form.costPriceOutput) || 0
    const si = parseFloat(form.sellPriceInput) || 0
    const so = parseFloat(form.sellPriceOutput) || 0
    const inputMargin = si - ci
    const outputMargin = so - co
    return { inputMargin, outputMargin }
  }, [form.costPriceInput, form.costPriceOutput, form.sellPriceInput, form.sellPriceOutput])

  // ── 从已有复制 ──
  const copyFromExisting = (item: VendorModel) => {
    setForm({
      vendorId: String(item.vendorId),
      modelId: String(item.modelId),
      upstreamModelName: item.upstreamModelName,
      apiEndpoint: item.apiEndpoint,
      apiKey: '',
      costPriceInput: item.costPriceInput,
      costPriceOutput: item.costPriceOutput,
      sellPriceInput: item.sellPriceInput,
      sellPriceOutput: item.sellPriceOutput,
      weight: String(item.weight),
      rpmLimit: item.rpmLimit?.toString() || '',
      tpmLimit: item.tpmLimit?.toString() || '',
    })
  }

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
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">新建映射</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
              message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
            }`}>
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          {/* 从已有复制 */}
          {existingItems.length > 0 && (
            <details className="bg-slate-50 rounded-lg border border-slate-200">
              <summary className="px-4 py-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                <Copy size={12} className="inline mr-1" />
                从已有配置复制
              </summary>
              <div className="px-4 pb-3 max-h-32 overflow-y-auto space-y-1">
                {existingItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => copyFromExisting(item)}
                    className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-700 transition"
                  >
                    {item.vendorName || `#${item.vendorId}`} → {item.modelName || `#${item.modelId}`}
                    {' '}({item.upstreamModelName})
                  </button>
                ))}
              </div>
            </details>
          )}

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
                    <option key={v.id} value={v.id}>{v.name} {v.status !== 'active' ? `(${v.status})` : ''}</option>
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
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.name}
                      {!m.status ? ' (已下架)' : ''}
                    </option>
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
                placeholder="sk-***"
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 价格区域 + 毛利预览 */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-3">
              <p className="text-xs text-slate-500 font-medium">价格设置</p>
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
              {/* 毛利预览 */}
              {(profitMargin.inputMargin !== 0 || profitMargin.outputMargin !== 0) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">毛利预览：</span>
                  <span className={profitMargin.inputMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                    输入 {profitMargin.inputMargin >= 0 ? '+' : ''}{profitMargin.inputMargin.toFixed(6)}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className={profitMargin.outputMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                    输出 {profitMargin.outputMargin >= 0 ? '+' : ''}{profitMargin.outputMargin.toFixed(6)}
                  </span>
                </div>
              )}
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
        </div>
      </div>
    </div>
  )
}

/* ─── Edit Modal ─── */

function EditModal({
  item,
  vendors,
  models,
  onClose,
  onSuccess,
}: {
  item: VendorModel
  vendors: Vendor[]
  models: AdminModel[]
  onClose: () => void
  onSuccess: () => void
}) {
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

  // ── 利润预览 ──
  const profitMargin = useMemo(() => {
    const ci = parseFloat(form.costPriceInput) || 0
    const co = parseFloat(form.costPriceOutput) || 0
    const si = parseFloat(form.sellPriceInput) || 0
    const so = parseFloat(form.sellPriceOutput) || 0
    return { inputMargin: si - ci, outputMargin: so - co }
  }, [form.costPriceInput, form.costPriceOutput, form.sellPriceInput, form.sellPriceOutput])

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
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">编辑映射 #{item.id}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${
              message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
            }`}>
              <AlertCircle size={16} />
              {message}
            </div>
          )}

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

            {/* 价格区域 + 毛利预览 */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-3">
              <p className="text-xs text-slate-500 font-medium">价格设置</p>
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
              {(profitMargin.inputMargin !== 0 || profitMargin.outputMargin !== 0) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">毛利预览：</span>
                  <span className={profitMargin.inputMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                    输入 {profitMargin.inputMargin >= 0 ? '+' : ''}{profitMargin.inputMargin.toFixed(6)}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className={profitMargin.outputMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                    输出 {profitMargin.outputMargin >= 0 ? '+' : ''}{profitMargin.outputMargin.toFixed(6)}
                  </span>
                </div>
              )}
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
            <h2 className="text-lg font-semibold">确认下架</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {message}
            </div>
          )}

          <p className="text-sm text-slate-600">
            确定要下架 <strong>{item.vendorName || `供应商#${item.vendorId}`}</strong> 的
            <strong>{item.upstreamModelName}</strong>（{item.modelName || `模型#${item.modelId}`}）映射吗？
            下架后该路由将不再生效，但数据保留。
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
              确认下架
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
