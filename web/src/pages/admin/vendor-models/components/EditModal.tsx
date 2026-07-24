import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { get, patch } from '@/lib/api'
import type { VendorModel, Vendor, AdminModel } from '@/types'

interface EditModalProps {
  item: VendorModel
  onClose: () => void
  onSuccess: () => void
}

export default function EditModal({ item, onClose, onSuccess }: EditModalProps) {
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
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
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
                <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">
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