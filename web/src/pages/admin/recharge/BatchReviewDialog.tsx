import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface BatchReviewDialogProps {
  open: boolean
  selectedCount: number
  defaultAction?: 'confirm' | 'reject'
  onSubmit: (data: {
    action: 'confirm' | 'reject'
    rejectReason?: string
    isSecond: boolean
  }) => Promise<void>
  onClose: () => void
}

export default function BatchReviewDialog({
  open,
  selectedCount,
  defaultAction = 'confirm',
  onSubmit,
  onClose,
}: BatchReviewDialogProps) {
  const [action, setAction] = useState<'confirm' | 'reject'>('confirm')
  const [isSecond, setIsSecond] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset on open
  useEffect(() => {
    if (open) {
      setAction(defaultAction)
      setIsSecond(false)
      setRejectReason('')
      setSubmitting(false)
      setError('')
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    if (action === 'reject' && !rejectReason.trim()) {
      setError('请输入拒绝原因')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({
        action,
        ...(action === 'reject' ? { rejectReason: rejectReason.trim() } : {}),
        isSecond,
      })
    } finally {
      setSubmitting(false)
    }
  }, [action, rejectReason, isSecond, onSubmit])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900">批量审核</h3>

        <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
          <p>
            已选择 <strong>{selectedCount}</strong> 笔订单
          </p>
        </div>

        {/* 操作选择 */}
        <div className="flex gap-3">
          <button
            onClick={() => setAction('confirm')}
            className={
              'flex-1 py-2 rounded-lg border text-sm transition ' +
              (action === 'confirm'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-slate-300 text-slate-600')
            }
          >
            批量通过
          </button>
          <button
            onClick={() => setAction('reject')}
            className={
              'flex-1 py-2 rounded-lg border text-sm transition ' +
              (action === 'reject'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-slate-300 text-slate-600')
            }
          >
            批量拒绝
          </button>
        </div>

        {/* 审核级别 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            审核级别
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setIsSecond(false)}
              className={
                'flex-1 py-2 rounded-lg border text-sm transition ' +
                (!isSecond
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-300 text-slate-600')
              }
            >
              初审
            </button>
            <button
              onClick={() => setIsSecond(true)}
              className={
                'flex-1 py-2 rounded-lg border text-sm transition ' +
                (isSecond
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-300 text-slate-600')
              }
            >
              复审
            </button>
          </div>
        </div>

        {/* 拒绝原因 */}
        {action === 'reject' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              统一拒绝原因
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
            className={
              'flex-1 py-2 rounded-lg text-sm text-white transition flex items-center justify-center gap-1 ' +
              (action === 'reject'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700') +
              ' disabled:opacity-50'
            }
          >
            {submitting && <Loader2 className="animate-spin" size={14} />}
            {action === 'reject' ? '确认拒绝' : '确认通过'}
          </button>
        </div>
      </div>
    </div>
  )
}
