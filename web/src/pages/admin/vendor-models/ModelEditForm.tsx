import { useState, useCallback, useMemo } from 'react'
import { post, patch, del } from '@/lib/api'
import type { VendorModel, Vendor, AdminModel } from '@/types'
import { Loader2, AlertCircle, Copy } from 'lucide-react'
import { emptyForm, fromItem, buildPayload } from './types'
import type { FormState } from './types'
import PriceConfigForm from './PriceConfigForm'

/* ═══════════════════════════════════════════════════
   ModalShell — shared by all modals
   ═══════════════════════════════════════════════════ */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Shared form fields
   ═══════════════════════════════════════════════════ */

function FormFields({ form, onChange, vendors, models }: {
  form: FormState; onChange: (f: string, v: string) => void; vendors: Vendor[]; models: AdminModel[]
}) {
  const selCls = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const inpCls = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">供应商 <span className="text-red-500">*</span></label>
          <select value={form.vendorId} onChange={e => onChange('vendorId', e.target.value)} className={selCls}>
            <option value="">请选择供应商</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.status !== 'active' ? ` (${v.status})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">模型 <span className="text-red-500">*</span></label>
          <select value={form.modelId} onChange={e => onChange('modelId', e.target.value)} className={selCls}>
            <option value="">请选择模型</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.name}{!m.status ? ' (已下架)' : ''}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">上游模型名称 <span className="text-red-500">*</span></label>
        <input type="text" value={form.upstreamModelName} onChange={e => onChange('upstreamModelName', e.target.value)}
          placeholder="如 gpt-4o-mini" className={inpCls} />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">API 接口地址 <span className="text-red-500">*</span></label>
        <input type="text" value={form.apiEndpoint} onChange={e => onChange('apiEndpoint', e.target.value)}
          placeholder="https://api.example.com/v1/chat/completions" className={inpCls} />
      </div>
      <PriceConfigForm
        costPriceInput={form.costPriceInput} costPriceOutput={form.costPriceOutput}
        sellPriceInput={form.sellPriceInput} sellPriceOutput={form.sellPriceOutput}
        onChange={onChange}
      />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">权重</label>
          <input type="number" min="0" value={form.weight} onChange={e => onChange('weight', e.target.value)} className={inpCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">RPM 限制</label>
          <input type="number" min="0" value={form.rpmLimit} onChange={e => onChange('rpmLimit', e.target.value)} placeholder="可选" className={inpCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">TPM 限制</label>
          <input type="number" min="0" value={form.tpmLimit} onChange={e => onChange('tpmLimit', e.target.value)} placeholder="可选" className={inpCls} />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Submit button bar
   ═══════════════════════════════════════════════════ */

function SubmitFooter({ submitting, label, onCancel, onSubmit }: {
  submitting: boolean; label: string; onCancel: () => void; onSubmit: () => void
}) {
  return (
    <div className="flex gap-2 justify-end pt-2">
      <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">取消</button>
      <button onClick={onSubmit} disabled={submitting}
        className="flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
        {submitting && <Loader2 className="animate-spin" size={14} />}{label}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   CreateModal
   ═══════════════════════════════════════════════════ */

export function CreateModal({ vendors, models, existingItems, onClose, onSuccess }: {
  vendors: Vendor[]; models: AdminModel[]; existingItems: VendorModel[]; onClose: () => void; onSuccess: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const setFld = useCallback((f: string, v: string) => setForm(p => ({ ...p, [f]: v })), [])

  const copyFromExisting = useCallback((item: VendorModel) => {
    setForm({
      ...emptyForm(),
      vendorId: String(item.vendorId), modelId: String(item.modelId),
      upstreamModelName: item.upstreamModelName, apiEndpoint: item.apiEndpoint,
      costPriceInput: item.costPriceInput, costPriceOutput: item.costPriceOutput,
      sellPriceInput: item.sellPriceInput, sellPriceOutput: item.sellPriceOutput,
      weight: String(item.weight),
      rpmLimit: item.rpmLimit?.toString() || '', tpmLimit: item.tpmLimit?.toString() || '',
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!form.vendorId || !form.modelId || !form.upstreamModelName || !form.apiEndpoint) { setMessage('请填写必填字段'); return }
    setSubmitting(true); setMessage('')
    try { await post('/api/v1/admin/vendor-models', buildPayload(form, true)); onSuccess() }
    catch (err: any) { setMessage('创建失败：' + (err.message || '')) }
    finally { setSubmitting(false) }
  }, [form, onSuccess])

  const msgCls = message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'

  return (
    <ModalShell title="新建映射" onClose={onClose}>
      {message && <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${msgCls}`}><AlertCircle size={16} />{message}</div>}

      {existingItems.length > 0 && (
        <details className="bg-slate-50 rounded-lg border border-slate-200">
          <summary className="px-4 py-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700 select-none">
            <Copy size={12} className="inline mr-1" />从已有配置复制
          </summary>
          <div className="px-4 pb-3 max-h-32 overflow-y-auto space-y-1">
            {existingItems.map(item => (
              <button key={item.id} onClick={() => copyFromExisting(item)}
                className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-700 transition">
                {item.vendorName || `#${item.vendorId}`} → {item.modelName || `#${item.modelId}`} ({item.upstreamModelName})
              </button>
            ))}
          </div>
        </details>
      )}

      <FormFields form={form} onChange={setFld} vendors={vendors} models={models} />

      <div className="mb-4">
        <label className="block text-xs text-slate-500 mb-1">API Key <span className="text-red-500">*</span></label>
        <input type="password" value={form.apiKey || ''} onChange={e => setFld('apiKey', e.target.value)}
          placeholder="sk-***" className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <SubmitFooter submitting={submitting} label="创建" onCancel={onClose} onSubmit={handleSubmit} />
    </ModalShell>
  )
}

/* ═══════════════════════════════════════════════════
   EditModal
   ═══════════════════════════════════════════════════ */

export function EditModal({ item, vendors, models, onClose, onSuccess }: {
  item: VendorModel; vendors: Vendor[]; models: AdminModel[]; onClose: () => void; onSuccess: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<FormState>(() => fromItem(item))
  const setFld = useCallback((f: string, v: string) => setForm(p => ({ ...p, [f]: v })), [])

  const handleSubmit = useCallback(async () => {
    if (!form.vendorId || !form.modelId || !form.upstreamModelName || !form.apiEndpoint) { setMessage('请填写必填字段'); return }
    setSubmitting(true); setMessage('')
    try { await patch(`/api/v1/admin/vendor-models/${item.id}`, buildPayload(form)); onSuccess() }
    catch (err: any) { setMessage('更新失败：' + (err.message || '')) }
    finally { setSubmitting(false) }
  }, [form, item.id, onSuccess])

  const msgCls = message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'

  return (
    <ModalShell title={`编辑映射 #${item.id}`} onClose={onClose}>
      {message && <div className={`flex items-center gap-2 p-3 text-sm rounded-lg ${msgCls}`}><AlertCircle size={16} />{message}</div>}

      <FormFields form={form} onChange={setFld} vendors={vendors} models={models} />

      <div className="mb-4">
        <label className="block text-xs text-slate-500 mb-1">API Key</label>
        <input type="password" value="••••••••••••••••" disabled
          className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
        <p className="text-xs text-slate-400 mt-1">创建时已设置，编辑时不可修改</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">RPM</label>
          <input type="number" min="0" value={form.rpmLimit} onChange={e => setFld('rpmLimit', e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">TPM</label>
          <input type="number" min="0" value={form.tpmLimit} onChange={e => setFld('tpmLimit', e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">状态</label>
          <select value={form.status} onChange={e => setFld('status', e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
        </div>
      </div>

      <SubmitFooter submitting={submitting} label="保存" onCancel={onClose} onSubmit={handleSubmit} />
    </ModalShell>
  )
}

/* ═══════════════════════════════════════════════════
   DeleteModal
   ═══════════════════════════════════════════════════ */

export function DeleteModal({ item, onClose, onSuccess }: {
  item: VendorModel; onClose: () => void; onSuccess: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = useCallback(async () => {
    setDeleting(true); setMessage('')
    try { await del(`/api/v1/admin/vendor-models/${item.id}`); onSuccess() }
    catch (err: any) { setMessage('删除失败：' + (err.message || '')) }
    finally { setDeleting(false) }
  }, [item.id, onSuccess])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">确认下架</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>
          {message && <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600"><AlertCircle size={16} />{message}</div>}
          <p className="text-sm text-slate-600">
            确定要下架 <strong>{item.vendorName || `供应商#${item.vendorId}`}</strong> 的
            <strong>{item.upstreamModelName}</strong>（{item.modelName || `模型#${item.modelId}`}）映射吗？
            下架后该路由将不再生效，但数据保留。
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">取消</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {deleting && <Loader2 className="animate-spin" size={14} />}确认下架
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
