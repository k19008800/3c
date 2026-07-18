// ── QuotaForm — 创建 & 编辑配额表单 ──
// CreateForm: 内联展开式创建表单
// EditModal: 弹出式编辑弹窗

import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { QuotaCreateForm, QuotaEditForm } from './types'

// ── CreateForm Props ──

interface CreateFormProps {
  form: QuotaCreateForm
  formOpen: boolean
  submitting: boolean
  formError: string
  formSuccess: string
  onSetForm: (f: QuotaCreateForm) => void
  onSubmit: () => void
  onCancel: () => void
}

export function CreateForm({
  form,
  formOpen,
  submitting,
  formError,
  formSuccess,
  onSetForm,
  onSubmit,
  onCancel,
}: CreateFormProps) {
  if (!formOpen) return null

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-indigo-200 space-y-4">
      <h3 className="font-semibold text-slate-900">设置用户额度</h3>

      {formError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {formError}
        </div>
      )}
      {formSuccess && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {formSuccess}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID *</label>
          <input
            type="number"
            value={form.userId}
            onChange={(e) => onSetForm({ ...form, userId: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">额度类型</label>
          <select
            value={form.quotaType}
            onChange={(e) => onSetForm({ ...form, quotaType: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="monthly">月度额度</option>
            <option value="one_time">一次性额度</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">额度金额 (￥) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.quotaAmount}
            onChange={(e) => onSetForm({ ...form, quotaAmount: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">告警百分比(%)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={form.alertPercent}
            onChange={(e) => onSetForm({ ...form, alertPercent: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制（可选）</label>
          <input
            type="number"
            min="0"
            value={form.rpmLimit ?? ''}
            onChange={(e) =>
              onSetForm({
                ...form,
                rpmLimit: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="每分钟请求数"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制（可选）</label>
          <input
            type="number"
            min="0"
            value={form.tpmLimit ?? ''}
            onChange={(e) =>
              onSetForm({
                ...form,
                tpmLimit: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="每分钟 Token 数"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">开始时间 *</label>
          <input
            type="datetime-local"
            value={form.periodStart}
            onChange={(e) => onSetForm({ ...form, periodStart: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">结束时间 *</label>
          <input
            type="datetime-local"
            value={form.periodEnd}
            onChange={(e) => onSetForm({ ...form, periodEnd: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
          <input
            type="text"
            value={form.reason}
            onChange={(e) => onSetForm({ ...form, reason: e.target.value })}
            placeholder="可选"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition text-sm flex items-center gap-2"
        >
          {submitting && <Loader2 className="animate-spin" size={16} />}
          确认设置
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm"
        >
          取消
        </button>
      </div>
    </div>
  )
}

// ── EditModal Props ──

interface EditModalProps {
  editingId: number | null
  editForm: QuotaEditForm
  editSubmitting: boolean
  editError: string
  onSetEditForm: (f: QuotaEditForm) => void
  onSave: (id: number) => void
  onCancel: () => void
}

export function EditModal({
  editingId,
  editForm,
  editSubmitting,
  editError,
  onSetEditForm,
  onSave,
  onCancel,
}: EditModalProps) {
  if (editingId === null) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-slate-900">
          修改额度 (ID: {editingId})
        </h3>

        {editError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
            <AlertCircle size={16} />
            {editError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">额度金额</label>
            <input
              type="number"
              step="0.01"
              value={editForm.quotaAmount}
              onChange={(e) => onSetEditForm({ ...editForm, quotaAmount: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">已使用</label>
            <input
              type="number"
              step="0.01"
              value={editForm.usedAmount}
              onChange={(e) => onSetEditForm({ ...editForm, usedAmount: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">告警百分比</label>
            <input
              type="number"
              min="0"
              max="100"
              value={editForm.alertPercent}
              onChange={(e) => onSetEditForm({ ...editForm, alertPercent: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">RPM 限制</label>
            <input
              type="number"
              min="0"
              value={editForm.rpmLimit ?? ''}
              onChange={(e) =>
                onSetEditForm({
                  ...editForm,
                  rpmLimit: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TPM 限制</label>
            <input
              type="number"
              min="0"
              value={editForm.tpmLimit ?? ''}
              onChange={(e) =>
                onSetEditForm({
                  ...editForm,
                  tpmLimit: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
            <input
              type="datetime-local"
              value={editForm.periodEnd}
              onChange={(e) => onSetEditForm({ ...editForm, periodEnd: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
            <input
              type="text"
              value={editForm.reason}
              onChange={(e) => onSetEditForm({ ...editForm, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSave(editingId)}
            disabled={editSubmitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition text-sm flex items-center gap-2"
          >
            {editSubmitting && <Loader2 className="animate-spin" size={16} />}
            保存
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
