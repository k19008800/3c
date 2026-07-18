import { useState } from 'react'
import {
  Loader2, Wallet, AlertCircle, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import type { AgentWallet } from './types'

interface Props {
  open: boolean
  wallet: AgentWallet | null
  walletLoading: boolean
  onSubmit: (form: {
    name: string
    amount: string
    count: string
    expiresAt: string
    note: string
  }) => Promise<string | null>
  onClose: () => void
}

export default function BatchCreateForm({ open, wallet, walletLoading, onSubmit, onClose }: Props) {
  const [form, setForm] = useState({ name: '', amount: '', count: '100', expiresAt: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  if (!open) return null

  const faceAmount = parseFloat(form.amount) || 0
  const count = parseInt(form.count, 10) || 0
  const totalNeeded = faceAmount * count
  const available = wallet ? parseFloat(wallet.available) : 0
  const exceeded = totalNeeded > 0 && totalNeeded > available

  const handleCreate = async () => {
    setFormError('')
    setFormSuccess('')
    if (!form.name || !form.amount || !form.count) {
      setFormError('请填写名称、面额和数量')
      return
    }
    setSubmitting(true)
    try {
      const err = await onSubmit(form)
      if (err) {
        setFormError(err)
      } else {
        setFormSuccess(`批次 "${form.name}" 创建成功`)
        setForm({ name: '', amount: '', count: '100', expiresAt: '', note: '' })
      }
    } catch (err: any) {
      setFormError(err.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-purple-200 space-y-4">
      <h3 className="font-semibold text-slate-900">生成兑换码批次</h3>
      <p className="text-sm text-slate-500">消耗代理余额生成兑换码，余额不足时无法创建</p>

      {walletLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="animate-spin" size={14} />加载余额...
        </div>
      ) : wallet ? (
        <div className={`rounded-lg p-4 border ${exceeded ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={18} className={exceeded ? 'text-red-500' : 'text-slate-500'} />
            <span className="text-sm font-medium text-slate-700">可提现余额</span>
          </div>
          <p className={`text-2xl font-bold ${exceeded ? 'text-red-600' : 'text-green-600'}`}>
            ¥{available.toFixed(2)}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
            <div>
              <span className="block text-slate-400">已结算佣金</span>
              <span className="font-medium text-slate-700">¥{parseFloat(wallet.settledCommission).toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-slate-400">兑换码锁定</span>
              <span className="font-medium text-amber-600">¥{parseFloat(wallet.redemptionLocked).toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-slate-400">提现处理中</span>
              <span className="font-medium text-slate-700">¥{parseFloat(wallet.pendingWithdraw).toFixed(2)}</span>
            </div>
          </div>

          {exceeded && (
            <div className="mt-3 flex items-center gap-2 text-red-700 bg-red-100 p-2 rounded-lg text-sm">
              <AlertTriangle size={14} />
              <span>余额不足！需 ¥{totalNeeded.toFixed(2)}，可用 ¥{available.toFixed(2)}，差额 ¥{(totalNeeded - available).toFixed(2)}</span>
            </div>
          )}

          {!exceeded && totalNeeded > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <span>本批次总额：</span>
              <span className="font-semibold text-purple-600">¥{totalNeeded.toFixed(2)}</span>
              <span>· 生成后可用余额：</span>
              <span className="font-semibold text-slate-700">¥{(available - totalNeeded).toFixed(2)}</span>
            </div>
          )}
        </div>
      ) : null}

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
          <label className="block text-sm font-medium text-slate-700 mb-1">批次名称 *</label>
          <input type="text" value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="如：客户回馈"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">面额 (¥) *</label>
          <input type="number" step="0.01" min="0.01" value={form.amount}
            onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">数量 *</label>
          <input type="number" min="1" max="100000" value={form.count}
            onChange={(e) => setForm(f => ({ ...f, count: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">过期时间</label>
          <input type="datetime-local" value={form.expiresAt}
            onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
          <input type="text" value={form.note}
            onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="可选"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={submitting || exceeded}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm flex items-center gap-2">
          {submitting && <Loader2 className="animate-spin" size={16} />}
          确认生成
        </button>
        <button onClick={onClose}
          className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition text-sm">
          取消
        </button>
      </div>
    </div>
  )
}
