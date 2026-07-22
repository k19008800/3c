import { useEffect, useState, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import type { RechargeOrder } from '@/types'

export type ReviewMode = 'first-confirm' | 'second-confirm' | 'legacy-confirm' | 'cancel'

interface ReviewDialogProps {
  open: boolean
  mode: ReviewMode
  order: RechargeOrder | null
  onClose: () => void
  onSubmit: (data: {
    action: 'confirm' | 'reject'
    rejectReason?: string
    bankTxId?: string
  }) => Promise<void>
}

const titleMap: Record<ReviewMode, string> = {
  'first-confirm': '对公转账 - 初审',
  'second-confirm': '对公转账 - 复审',
  'legacy-confirm': '确认到账',
  cancel: '取消订单',
}

export default function ReviewDialog({
  open,
  mode,
  order,
  onClose,
  onSubmit,
}: ReviewDialogProps) {
  const [action, setAction] = useState<'confirm' | 'reject'>('confirm')
  const [rejectReason, setRejectReason] = useState('')
  const [bankTxId, setBankTxId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isSecond = mode === 'second-confirm'
  const isCancel = mode === 'cancel'
  const isLegacy = mode === 'legacy-confirm'

  // Reset on open
  useEffect(() => {
    if (open) {
      setAction('confirm')
      setRejectReason('')
      setBankTxId('')
      setSubmitting(false)
      setError('')
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    if (isCancel) {
      setSubmitting(true)
      try {
        await onSubmit({ action: 'reject' } as any)
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (action === 'reject' && !rejectReason.trim()) {
      setError('请输入拒绝原因')
      return
    }
    if (isSecond && action === 'confirm' && !bankTxId.trim()) {
      setError('请输入银行交易流水号')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await onSubmit({
        action,
        ...(action === 'reject' ? { rejectReason: rejectReason.trim() } : {}),
        ...(isSecond && action === 'confirm' ? { bankTxId: bankTxId.trim() } : {}),
      })
    } finally {
      setSubmitting(false)
    }
  }, [action, rejectReason, bankTxId, isSecond, isCancel, onSubmit])

  if (!open || !order) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900">{titleMap[mode]}</h3>

        {/* 订单信息 */}
        <div className="text-sm text-slate-600 space-y-1.5 bg-slate-50 p-3 rounded-lg">
          <p>
            订单号：<span className="font-mono">{order.orderNo}</span>
          </p>
          <p className="text-base font-semibold text-slate-900">
            金额：¥{Number(order.amount || 0).toFixed(2)}
          </p>
          <p>
            用户：
            {order.userEmail || order.userNickname || `ID:${order.userId}`}
          </p>
          {order.channel === 'bank_transfer' && (
            <>
              <div className="border-t border-slate-200 my-1.5" />
              <p className="font-medium text-slate-800">银行转账信息</p>
              <p>
                银行：{order.bankName || <span className="text-slate-400">未提供</span>}
              </p>
              <p>
                账号：<span className="font-mono">{order.accountNumber || '未提供'}</span>
              </p>
              <p>转账日期：{order.transferDate || '未提供'}</p>
              {order.remark && (
                <p className="mt-1 text-xs text-slate-500">备注：{order.remark}</p>
              )}
              {order.voucherImage && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500 mb-1">转账凭证：</p>
                  <img
                    src={order.voucherImage}
                    alt="转账凭证"
                    className="max-h-40 rounded border border-slate-200 object-contain cursor-pointer hover:opacity-90 transition"
                    onClick={() => window.open(order.voucherImage!, '_blank')}
                  />
                </div>
              )}
            </>
          )}
          {order.voucherNo && (
            <p>
              凭证号：<span className="font-mono">{order.voucherNo}</span>
            </p>
          )}
          {order.firstConfirmedBy && isSecond && (
            <p className="text-blue-600 font-medium mt-1">✅ 已初审，待复审</p>
          )}
        </div>

        {/* 取消订单提示 */}
        {isCancel && (
          <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
            确定要取消此订单吗?取消后不可恢复。
          </div>
        )}

        {/* 操作选择（非取消/非 legacy） */}
        {!isCancel && !isLegacy && (
          <div className="flex gap-3">
            <button
              onClick={() => setAction('confirm')}
              className={`flex-1 py-2 rounded-lg border text-sm transition ${
                action === 'confirm'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              ✅ {isSecond ? '复审通过' : '审核通过'}
            </button>
            <button
              onClick={() => setAction('reject')}
              className={`flex-1 py-2 rounded-lg border text-sm transition ${
                action === 'reject'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              ❌ 拒绝
            </button>
          </div>
        )}

        {/* 拒绝原因 */}
        {action === 'reject' && !isLegacy && !isCancel && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              拒绝原因
            </label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}

        {/* 复审：银行交易流水号 */}
        {isSecond && action === 'confirm' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              银行交易流水号
            </label>
            <input
              type="text"
              value={bankTxId}
              onChange={(e) => setBankTxId(e.target.value)}
              placeholder="请输入银行流水号"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-lg text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* 按钮组 */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 py-2 rounded-lg text-sm text-white transition flex items-center justify-center gap-1 ${
              action === 'reject' || isCancel
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {submitting && <Loader2 className="animate-spin" size={14} />}
            {isCancel
              ? '确认取消'
              : action === 'reject'
                ? '确认拒绝'
                : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
