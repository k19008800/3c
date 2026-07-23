import React, { memo } from 'react'
import { Ban, CheckCircle2, Trash2 } from 'lucide-react'

interface UserActionsProps {
  selectedCount: number
  onDisable: () => void
  onEnable: () => void
  onClear: () => void
  loading?: boolean
}

const UserActions: React.FC<UserActionsProps> = memo(({
  selectedCount,
  onDisable,
  onEnable,
  onClear,
  loading = false
}) => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-700 font-bold">{selectedCount}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-blue-800">
              已选择 {selectedCount} 个用户
            </p>
            <p className="text-xs text-blue-600">
              可以对选中的用户执行批量操作
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onEnable}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 size={14} />
            批量启用
          </button>
          
          <button
            onClick={onDisable}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Ban size={14} />
            批量禁用
          </button>
          
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Trash2 size={14} />
            清除选择
          </button>
        </div>
      </div>
      
      {loading && (
        <div className="mt-3 text-sm text-blue-700">
          正在执行批量操作，请稍候...
        </div>
      )}
    </div>
  )
})

UserActions.displayName = 'UserActions'

export default UserActions