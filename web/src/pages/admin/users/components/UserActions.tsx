import React, { memo } from 'react'
import { Ban, CheckCircle2, Trash2, DollarSign, Award, Download } from 'lucide-react'

interface UserActionsProps {
  selectedCount: number
  onDisable: () => void
  onEnable: () => void
  onBalance: () => void
  onLevel: () => void
  onExport: () => void
  onClear: () => void
  loading?: boolean
}

const UserActions: React.FC<UserActionsProps> = memo(({
  selectedCount,
  onDisable,
  onEnable,
  onBalance,
  onLevel,
  onExport,
  onClear,
  loading = false
}) => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-700 font-bold text-sm">{selectedCount}</span>
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
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* 启用/禁用 */}
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

          {/* 余额调整 */}
          <button
            onClick={onBalance}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DollarSign size={14} />
            调整余额
          </button>

          {/* 代理商等级 */}
          <button
            onClick={onLevel}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Award size={14} />
            设置等级
          </button>

          {/* 导出 */}
          <button
            onClick={onExport}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            导出
          </button>
          
          {/* 清除选择 */}
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
        <div className="mt-3 text-sm text-blue-700 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          正在执行批量操作，请稍候...
        </div>
      )}
    </div>
  )
})

UserActions.displayName = 'UserActions'

export default UserActions