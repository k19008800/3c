import React, { useState, useEffect, useCallback } from 'react'
import { X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { post } from '@/lib/api'

export type BatchActionType = 'disable' | 'enable' | 'balance' | 'level' | 'export'

interface BatchOperationDialogProps {
  isOpen: boolean
  onClose: () => void
  actionType: BatchActionType
  selectedCount: number
  selectedIds: number[]
  onSuccess: () => void
}

interface BatchResult {
  success: number
  failed: number
  errors?: Array<{ userId: number; reason: string }>
}

const ACTION_CONFIG: Record<BatchActionType, {
  title: string
  description: string
  confirmText: string
  danger: boolean
  requiresInput: boolean
}> = {
  disable: {
    title: '批量禁用用户',
    description: '禁用后用户将无法登录和使用服务',
    confirmText: '确认禁用',
    danger: true,
    requiresInput: true,
  },
  enable: {
    title: '批量启用用户',
    description: '启用后用户将恢复正常使用',
    confirmText: '确认启用',
    danger: false,
    requiresInput: false,
  },
  balance: {
    title: '批量调整余额',
    description: '对所有选中用户调整相同金额',
    confirmText: '确认调整',
    danger: true,
    requiresInput: true,
  },
  level: {
    title: '批量设置代理商等级',
    description: '设置选中用户的代理商等级',
    confirmText: '确认设置',
    danger: false,
    requiresInput: true,
  },
  export: {
    title: '批量导出用户',
    description: '导出选中用户的数据为 CSV 文件',
    confirmText: '确认导出',
    danger: false,
    requiresInput: false,
  },
}

const BatchOperationDialog: React.FC<BatchOperationDialogProps> = ({
  isOpen,
  onClose,
  actionType,
  selectedCount,
  selectedIds,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 表单字段
  const [reason, setReason] = useState('')
  const [disabledUntil, setDisabledUntil] = useState('')
  const [amount, setAmount] = useState('')
  const [balanceDescription, setBalanceDescription] = useState('')
  const [level, setLevel] = useState('1')

  const config = ACTION_CONFIG[actionType]

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setLoading(false)
      setResult(null)
      setError(null)
      setReason('')
      setDisabledUntil('')
      setAmount('')
      setBalanceDescription('')
      setLevel('1')
    }
  }, [isOpen, actionType])

  const handleSubmit = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      let endpoint = ''
      let body: any = { userIds: selectedIds }

      switch (actionType) {
        case 'disable':
          endpoint = '/api/v1/admin/users/batch/disable'
          body.reason = reason || undefined
          body.disabledUntil = disabledUntil || undefined
          break
        case 'enable':
          endpoint = '/api/v1/admin/users/batch/enable'
          break
        case 'balance':
          endpoint = '/api/v1/admin/users/batch/balance'
          body.amount = parseFloat(amount)
          body.description = balanceDescription || undefined
          break
        case 'level':
          endpoint = '/api/v1/admin/users/batch/level'
          body.level = parseInt(level, 10)
          body.reason = reason || undefined
          break
        case 'export':
          endpoint = '/api/v1/admin/users/batch/export'
          // 导出直接下载，不走 JSON 响应
          const res = await fetch('/api/v1/admin/users/batch/export', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
            },
            body: JSON.stringify({ userIds: selectedIds }),
          })
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `users_export_${Date.now()}.csv`
          a.click()
          URL.revokeObjectURL(url)
          setLoading(false)
          onSuccess()
          return
      }

      const data = await post<BatchResult>(endpoint, body)
      setResult(data)
      
      if (data.success > 0 && data.failed === 0) {
        setTimeout(() => {
          onSuccess()
        }, 1500)
      }
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }, [actionType, selectedIds, reason, disabledUntil, amount, balanceDescription, level, onSuccess])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${config.danger ? 'bg-red-50' : 'bg-slate-50'}`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-semibold ${config.danger ? 'text-red-900' : 'text-slate-900'}`}>
              {config.title}
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 rounded-lg transition"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>
          <p className={`text-sm mt-1 ${config.danger ? 'text-red-700' : 'text-slate-600'}`}>
            {config.description}
          </p>
          <p className={`text-sm font-medium mt-2 ${config.danger ? 'text-red-800' : 'text-slate-700'}`}>
            已选择 {selectedCount} 个用户
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Input fields based on action type */}
          {actionType === 'disable' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  禁用原因（可选）
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="请输入禁用原因..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  禁用截止时间（可选）
                </label>
                <input
                  type="datetime-local"
                  value={disabledUntil}
                  onChange={(e) => setDisabledUntil(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">留空表示永久禁用</p>
              </div>
            </>
          )}

          {actionType === 'balance' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  调整金额 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="正数增加，负数减少"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">元</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  单次调整上限 1000 元，超出需单独操作
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  备注说明（可选）
                </label>
                <input
                  type="text"
                  value={balanceDescription}
                  onChange={(e) => setBalanceDescription(e.target.value)}
                  placeholder="调整原因..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}

          {actionType === 'level' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  代理商等级 <span className="text-red-500">*</span>
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      等级 {n}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  仅对角色为"代理商"的用户生效
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  操作原因（可选）
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="等级调整原因..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div className="space-y-2">
              <div className={`flex items-start gap-2 p-3 rounded-lg ${
                result.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
              }`}>
                {result.failed === 0 ? (
                  <CheckCircle2 size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle size={16} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="text-sm">
                  <p className={result.failed === 0 ? 'text-green-700' : 'text-yellow-700'}>
                    成功: {result.success} 个用户
                    {result.failed > 0 && `，失败: ${result.failed} 个用户`}
                  </p>
                </div>
              </div>
              
              {/* Error details */}
              {result.errors && result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs font-medium text-slate-600 mb-1">失败详情:</p>
                  <ul className="text-xs text-slate-500 space-y-0.5">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>
                        用户 #{err.userId}: {err.reason}
                      </li>
                    ))}
                    {result.errors.length > 10 && (
                      <li className="text-slate-400">... 还有 {result.errors.length - 10} 条</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
          >
            {result ? '关闭' : '取消'}
          </button>
          {!result && (
            <button
              onClick={handleSubmit}
              disabled={loading || (actionType === 'balance' && !amount)}
              className={`px-4 py-2 text-sm text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                config.danger 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" />
                  处理中...
                </span>
              ) : (
                config.confirmText
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BatchOperationDialog