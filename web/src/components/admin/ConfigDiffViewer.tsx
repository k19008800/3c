import { Plus, Minus, ArrowRight, FileText } from 'lucide-react'

interface DiffResult {
  added: string[]
  removed: string[]
  changed: Array<{ key: string; old: any; new: any }>
  unchanged: string[]
}

interface ConfigDiffViewerProps {
  oldValue: any
  newValue: any
  diff: DiffResult
  compact?: boolean
}

export default function ConfigDiffViewer({ oldValue, newValue, diff, compact = false }: ConfigDiffViewerProps) {
  const formatValue = (val: any): string => {
    if (val === null) return 'null'
    if (val === undefined) return 'undefined'
    if (typeof val === 'object') return JSON.stringify(val, null, 2)
    return String(val)
  }

  if (compact) {
    return (
      <div className="space-y-1 text-xs font-mono">
        {diff.added.length > 0 && (
          <div className="text-green-600">
            + {diff.added.length} 项新增
          </div>
        )}
        {diff.removed.length > 0 && (
          <div className="text-red-600">
            - {diff.removed.length} 项删除
          </div>
        )}
        {diff.changed.length > 0 && (
          <div className="text-amber-600">
            ~ {diff.changed.length} 项变更
          </div>
        )}
        {diff.unchanged.length > 0 && (
          <div className="text-slate-400">
            = {diff.unchanged.length} 项不变
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 新增字段 */}
      {diff.added.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-2">
            <Plus size={14} />
            <span>新增字段 ({diff.added.length})</span>
          </div>
          <div className="space-y-1">
            {diff.added.map((key) => (
              <div key={key} className="flex items-start gap-2 text-xs bg-green-50 border border-green-200 rounded px-2 py-1.5">
                <code className="font-mono text-green-700">{key}</code>
                <ArrowRight size={10} className="text-slate-400 mt-0.5" />
                <code className="font-mono text-slate-700 flex-1">{formatValue(newValue[key])}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 删除字段 */}
      {diff.removed.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-2">
            <Minus size={14} />
            <span>删除字段 ({diff.removed.length})</span>
          </div>
          <div className="space-y-1">
            {diff.removed.map((key) => (
              <div key={key} className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded px-2 py-1.5">
                <code className="font-mono text-red-700 line-through">{key}</code>
                <span className="text-slate-400">:</span>
                <code className="font-mono text-slate-500">{formatValue(oldValue[key])}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 变更字段 */}
      {diff.changed.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-2">
            <FileText size={14} />
            <span>变更字段 ({diff.changed.length})</span>
          </div>
          <div className="space-y-2">
            {diff.changed.map(({ key, old, new: newVal }) => (
              <div key={key} className="bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-xs font-mono font-medium text-amber-800">{key}</code>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">旧值</div>
                    <div className="bg-red-100 border border-red-200 rounded px-2 py-1.5">
                      <code className="text-xs font-mono text-red-700">{formatValue(old)}</code>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">新值</div>
                    <div className="bg-green-100 border border-green-200 rounded px-2 py-1.5">
                      <code className="text-xs font-mono text-green-700">{formatValue(newVal)}</code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 无变化 */}
      {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
        <div className="text-center text-sm text-slate-400 py-4">
          无差异
        </div>
      )}
    </div>
  )
}
