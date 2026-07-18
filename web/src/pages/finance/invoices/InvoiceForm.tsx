import { useState, useCallback } from 'react'
import { post } from '@/lib/api'
import { Loader2, AlertCircle } from 'lucide-react'

interface Props {
  availableAmount: string
  onClose: () => void
  onSuccess: () => void
}

export default function InvoiceForm({ availableAmount, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState('')
  const [invoiceType, setInvoiceType] = useState('normal')
  const [title, setTitle] = useState('')
  const [taxId, setTaxId] = useState('')
  const [bankInfo, setBankInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const maxAmount = parseFloat(availableAmount)

  const handleSubmit = useCallback(async () => {
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('请输入有效金额'); return }
    if (amt > maxAmount) { setError(`申请金额不能超过可开票额度 (¥${maxAmount.toFixed(2)})`); return }
    if (!title.trim()) { setError('请填写发票抬头'); return }
    if (invoiceType === 'special' && !taxId.trim()) { setError('专票请填写税号'); return }

    setSaving(true)
    try {
      await post('/api/v1/invoices', {
        amount: amt,
        invoiceType,
        title: title.trim(),
        taxId: taxId.trim() || undefined,
        bankInfo: bankInfo.trim() || undefined,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '申请开票失败')
    } finally {
      setSaving(false)
    }
  }, [amount, invoiceType, title, taxId, bankInfo, maxAmount, onSuccess])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">申请开票</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-700">
            可开票额度：<strong>¥{maxAmount.toFixed(2)}</strong>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">发票类型</label>
            <select
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="normal">普票</option>
              <option value="special">专票</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">金额 <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-sm">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min={0.01}
                max={maxAmount}
                step={0.01}
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">发票抬头 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="公司名称或个人姓名"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              税号 {invoiceType === 'special' && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="统一社会信用代码"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">银行信息</label>
            <input
              type="text"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              placeholder="开户行及账号（选填）"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '提交申请'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
