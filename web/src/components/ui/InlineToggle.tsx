/**
 * InlineToggle — 行内开关组件
 *
 * 列表页状态列直接切换，无需进入编辑页。
 * 关键操作（有关联影响）弹出确认对话框。
 *
 * @example
 * <InlineToggle
 *   value={vendor.status === 'active'}
 *   onChange={async (enabled) => {
 *     await patch(`/api/v1/admin/vendors/${vendor.id}`, {
 *       status: enabled ? 'active' : 'disabled'
 *     })
 *   }}
 *   confirm={vendor.modelCount > 0 ? {
 *     title: '禁用供应商',
 *     description: `该供应商下有 ${vendor.modelCount} 个模型映射，禁用后关联通道将不可用`
 *   } : undefined}
 * />
 */

import { useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

interface InlineToggleProps {
  value: boolean
  onChange: (value: boolean) => Promise<void>
  disabled?: boolean
  /** 确认弹窗配置（关键操作需要） */
  confirm?: { title: string; description: string }
  /** 成功回调 */
  onSuccess?: () => void
  onError?: (err: Error) => void
  /** 自定义标签 */
  labels?: { on: string; off: string }
  size?: 'sm' | 'md'
}

export default function InlineToggle({
  value,
  onChange,
  disabled,
  confirm,
  onSuccess,
  onError,
  labels,
  size = 'sm',
}: InlineToggleProps) {
  const [loading, setLoading] = useState(false)

  const handleToggle = useCallback(async () => {
    // 有关键操作确认
    if (confirm) {
      const confirmed = window.confirm(
        `${confirm.title}\n\n${confirm.description}\n\n确定要继续吗?`
      )
      if (!confirmed) return
    }

    setLoading(true)
    try {
      await onChange(!value)
      onSuccess?.()
    } catch (err: any) {
      onError?.(err)
    } finally {
      setLoading(false)
    }
  }, [value, onChange, confirm, onSuccess, onError])

  const sizeClasses = size === 'sm'
    ? { track: 'w-9 h-5', thumb: 'w-4 h-4', translateOn: 'translate-x-4' }
    : { track: 'w-11 h-6', thumb: 'w-5 h-5', translateOn: 'translate-x-5' }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 size={14} className="animate-spin" />
        处理中...
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${sizeClasses.track}
        ${value ? 'bg-blue-600' : 'bg-slate-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={value ? (labels?.on || '已启用') : (labels?.off || '已禁用')}
    >
      <span
        className={`inline-block rounded-full bg-white shadow-sm transform transition-transform
          ${sizeClasses.thumb}
          ${value ? sizeClasses.translateOn : 'translate-x-0.5'}
        `}
      />
    </button>
  )
}
