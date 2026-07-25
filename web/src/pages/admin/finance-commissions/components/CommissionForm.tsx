import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import type { CommissionRollupRow } from '@/types'

interface CommissionFormProps {
  isOpen: boolean
  onClose: () => void
  commission?: CommissionRollupRow | null
  onSave: (data: any) => Promise<void>
}

export default function CommissionForm({ isOpen, onClose, commission, onSave }: CommissionFormProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    settlementAmount: commission?.pendingAmount || 0,
    settlementDate: new Date().toISOString().split('T')[0],
    notes: '',
    referenceNumber: '',
  })

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSave({
        commissionId: commission?.agentId,
        ...formData,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {commission ? '结算佣金' : '手动调整'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Commission Info */}
        {commission && (
          <div className="p-4 border-b bg-slate-50">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">代理商:</span>
                <span className="text-sm font-medium">
                  {commission.agentEmail || `Agent #${commission.agentId}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">日期:</span>
                <span className="text-sm font-medium">{commission.reportDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">待结算金额:</span>
                <span className="text-sm font-medium text-yellow-600">
                  ¥{(Number(commission.pendingAmount) || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              结算金额
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={commission?.pendingAmount || 0}
              value={formData.settlementAmount}
              onChange={(e) => handleChange('settlementAmount', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border rounded"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              最大可结算金额: ¥{(Number(commission?.pendingAmount) || 0).toFixed(2)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              结算日期
            </label>
            <input
              type="date"
              value={formData.settlementDate}
              onChange={(e) => handleChange('settlementDate', e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              参考号
            </label>
            <input
              type="text"
              placeholder="银行流水号/交易号"
              value={formData.referenceNumber}
              onChange={(e) => handleChange('referenceNumber', e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              备注
            </label>
            <textarea
              placeholder="结算备注信息"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded hover:bg-slate-50"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  保存中...
                </>
              ) : (
                <>
                  <Save size={16} />
                  确认结算
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}