import { useEffect, useState, useCallback, useMemo } from 'react'
import { Loader2, AlertCircle, ChevronDown } from 'lucide-react'
import { REJECT_REASONS } from './types'

interface WithdrawReviewProps {
  open: boolean
  kind: 'first-review' | 'second-review' | 'mark-paid' | null
  recordId: number | null
  onClose: () => void
  onSubmit: (data: {
    action: 'approve' | 'reject'
    rejectReason?: string
    bankVoucherUrl?: string
  }) => Promise<void>
}

const titleMap: Record<string, string> = {
  'first-review': '初审操作',
  'second-review': '复审操作',
  'mark-paid': '标记已打款',
}

export default function WithdrawReview({
  open,
  kind,
  recordId,
  onClose,
  onSubmit,
}: WithdrawReviewProps) {
  const [action, setAction] = useState<'approve' | 'reject'>('approve')
  const [rejectReason, setRejectReason] = useState('')
  const [bankVoucherUrl, setBankVoucherUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showRejectOptions, setShowRejectOptions] = useState(false)

  const isMarkPaid = kind === 'mark-paid'
  const isSecondReview = kind === 'second-review'
  const needsReject = !isMarkPaid

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setAction('approve')
      setRejectReason('')
      setBankVoucherUrl('')
      setSubmitting(false)
      setError('')
      setShowRejectOptions(false)
    }
  }, [open])

  const selectRejectReason = useCallback((reason: string) => {
    setRejectReason(reason)
    setShowRejectOptions(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!recordId) return

    // Validate
    if (needsReject && action === 'reject' && !rejectReason.trim()) {
      setError('请填写拒绝原因')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await onSubmit({
        action,
        ...(action === 'reject' ? { rejectReason: rejectReason.trim() } : {}),
        ...(isMarkPaid || (isSecondReview && action === 'approve')
          ? { bankVoucherUrl: bankVoucherUrl.trim() || undefined }
          : {}),
      })
    } finally {
      setSubmitting(false)
    }
  }, [recordId, action, rejectReason, bankVoucherUrl, needsReject, isMarkPaid, isSecondReview, onSubmit])

  if (!open || !kind) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h3 className="text-lg font-semibold text-slate-900">
          {titleMap[kind] || '操作'}
          {recordId && <span className="text-sm font-normal text-slate-400 ml-2">#{recordId}</span>}
        </h3>

        {/* Mark-paid / Second-Review: voucher URL */}
        {(isMarkPaid || (isSecondReview && action === 'approve')) && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              打款凭证 URL（可选）
            </label>
            <input
              type="text"
              value={bankVoucherUrl}
              onChange={(e) => setBankVoucherUrl(e.target.value)}
              placeholder="请输入打款凭证图片地址"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Action toggle (not mark-paid) */}
        {needsReject && (
          <div className="flex gap-3">
            <button
              onClick={() => setAction('approve')}
              className={`flex-1 py-2 rounded-lg border text-sm transition ${
                action === 'approve'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              ✔ 通过
            </button>
            <button
              onClick={() => setAction('reject')}
              className={`flex-1 py-2 rounded-lg border text-sm transition ${
                action === 'reject'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              ✕ 拒绝
            </button>
          </div>
        )}

        {/* Reject reason */}
        {needsReject && action === 'reject' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              拒绝原因
            </label>
            <div className="relative">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="输入拒绝原因或从下方选择"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="button"
                onClick={() => setShowRejectOptions(!showRejectOptions)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {showRejectOptions && (
              <div className="mt-2 border border-slate-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
                {REJECT_REASONS.map((reason, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectRejectReason(reason)}
                    className="block w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition border-b border-slate-100 last:border-0"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}

            {rejectReason && (
              <p className="mt-1 text-xs text-slate-400">
                已选：{rejectReason}
              </p>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-lg text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Buttons */}
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
              !isMarkPaid && action === 'reject'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {submitting && <Loader2 className="animate-spin" size={14} />}
            {isMarkPaid ? '确认打款' : action === 'reject' ? '确认拒绝' : '确认通过'}
          </button>
        </div>
      </div>
    </div>
  )
}
