import React, { memo } from 'react'
import {
  Play,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from 'lucide-react'

interface BatchOperationsProps {
  selectedCount: number
  testing: boolean
  onBatchTest: () => void
  onBatchEnable: () => void
  onBatchDisable: () => void
  onBatchDelete: () => void
  onBatchExport: () => void
  onClearSelection: () => void
}

const BatchOperations: React.FC<BatchOperationsProps> = memo(({
  selectedCount,
  testing,
  onBatchTest,
  onBatchEnable,
  onBatchDisable,
  onBatchDelete,
  onBatchExport,
  onClearSelection
}) => {
  if (selectedCount === 0) {
    return null
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-700 font-bold">{selectedCount}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-blue-800">
              已选择 {selectedCount} 个密钥
            </p>
            <p className="text-xs text-blue-600">
              可以对选中的密钥执行批量操作
            </p>
          </div>
        </div>
        
        <button
          onClick={onClearSelection}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <XCircle size={14} />
          清除选择
        </button>
      </div>

      {/* Operation buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onBatchTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
        >
          <Play size={14} />
          {testing ? '测试中...' : '批量测试'}
        </button>
        
        <button
          onClick={onBatchEnable}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          <ToggleRight size={14} />
          批量启用
        </button>
        
        <button
          onClick={onBatchDisable}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
        >
          <ToggleLeft size={14} />
          批量禁用
        </button>
        
        <button
          onClick={onBatchDelete}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
        >
          <Trash2 size={14} />
          批量删除
        </button>
        
        <button
          onClick={onBatchExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          <Download size={14} />
          批量导出
        </button>
      </div>

      {/* Warning message */}
      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} />
          <span>批量操作将影响所有选中的密钥，请谨慎操作。</span>
        </div>
      </div>

      {/* Testing progress */}
      {testing && (
        <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600" />
            <span className="text-sm text-green-700">
              正在测试 {selectedCount} 个密钥，请稍候...
            </span>
          </div>
        </div>
      )}
    </div>
  )
})

BatchOperations.displayName = 'BatchOperations'

export default BatchOperations