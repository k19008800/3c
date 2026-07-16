/**
 * BatchActionBar — 批量操作栏
 *
 * 选中列表行后出现在表格顶部，支持批量启用/禁用/删除等操作。
 *
 * @example
 * <BatchActionBar
 *   selectedIds={selectedIds}
 *   onSelectionChange={setSelectedIds}
 *   actions={[
 *     { key: 'enable', label: '批量启用', icon: <Power />, action: async (ids) => { ... } },
 *     { key: 'delete', label: '批量删除', icon: <Trash2 />, variant: 'danger',
 *       confirm: `确定删除 ${selectedIds.length} 项？`, action: async (ids) => { ... } },
 *   ]}
 *   total={total}
 * />
 */

import { useState, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface BatchAction {
  key: string
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'danger'
  /** 操作前确认文案 */
  confirm?: string
  /** 操作函数 */
  action: (selectedIds: number[]) => Promise<void>
  /** 最少选择数量（默认 1） */
  minSelect?: number
}

interface BatchActionBarProps {
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  actions: BatchAction[]
  total: number
  selectedLabel?: (count: number) => string
}

export default function BatchActionBar({
  selectedIds,
  onSelectionChange,
  actions,
  total,
  selectedLabel = (count) => `已选 ${count} 项`,
}: BatchActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleAction = useCallback(async (action: BatchAction) => {
    if (selectedIds.length < (action.minSelect ?? 1)) return

    // 确认
    if (action.confirm && !window.confirm(action.confirm)) return

    setLoading(action.key)
    setError('')
    try {
      await action.action(selectedIds)
      onSelectionChange([])
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(null)
    }
  }, [selectedIds, onSelectionChange])

  if (selectedIds.length === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <span className="text-blue-700 font-medium shrink-0">
        {selectedLabel(selectedIds.length)}
        <span className="text-blue-400 font-normal ml-1">（共 {total} 项）</span>
      </span>

      <div className="flex items-center gap-2 ml-2">
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={() => handleAction(action)}
            disabled={loading !== null || selectedIds.length < (action.minSelect ?? 1)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition text-xs font-medium
              ${action.variant === 'danger'
                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                : 'text-blue-600 bg-blue-100 hover:bg-blue-200'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {loading === action.key ? (
              <Loader2 size={14} className="animate-spin" />
            ) : action.icon}
            {action.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => onSelectionChange([])}
        className="ml-auto text-xs text-slate-400 hover:text-slate-600"
      >
        取消选择
      </button>

      {error && (
        <div className="flex items-center gap-1 text-red-600 text-xs ml-2">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </div>
  )
}
