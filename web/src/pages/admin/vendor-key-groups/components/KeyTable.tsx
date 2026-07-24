import {
  Square, CheckSquare, CheckCircle2, AlertCircle, Loader2,
  DollarSign, Cable, ToggleLeft, ToggleRight, Eye, EyeOff,
  Edit3, Trash2, Copy, X
} from 'lucide-react'

interface KeyItem {
  id: number
  groupId: number
  apiKeyPrefix: string | null
  apiKeyEncrypted?: string
  weight: number
  priority: number
  status: boolean
  isDown: boolean
  consecutiveFailures: number
  totalCalls: number
  successCalls: number
  sellPriceInput: string | null
  sellPriceOutput: string | null
  costPriceInput: string | null
  costPriceOutput: string | null
  notes: string | null
  deletedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

interface KeyTableProps {
  items: KeyItem[]
  filteredItems: KeyItem[]
  hasSelectedGroup: boolean
  itemsLoading: boolean
  selectedIds: Set<number>
  revealedIds: Record<number, string>
  revealing: number | null
  editingNotes: Record<number, string>
  savingNotes: Record<number, boolean>
  batchTestingItems: number[]
  tableScrollRef: React.RefObject<HTMLDivElement | null>
  onSelectItem: (id: number) => void
  onSelectAll: () => void
  onRevealKey: (item: KeyItem) => void
  onCopyKey: (fullKey: string) => void
  onToggleItem: (item: KeyItem) => void
  onTestItem: (item: KeyItem) => void
  onPriceConfig: (item: KeyItem) => void
  onEditItem: (item: KeyItem) => void
  onDeleteItem: (item: KeyItem) => void
  onNotesChange: (itemId: number, notes: string) => void
  onSaveNotes: (itemId: number) => void
  onCancelEditNotes: (itemId: number) => void
}

/** 计算健康状态 */
function calcHealth(item: KeyItem): { level: 'healthy' | 'warn' | 'danger'; rate: number | null } {
  if (item.totalCalls < 10) return { level: 'warn', rate: null } // 数据不足
  const rate = item.totalCalls > 0 ? (item.successCalls / item.totalCalls) * 100 : 0
  if (rate >= 90 && item.consecutiveFailures < 3) return { level: 'healthy', rate }
  if (rate >= 70 && item.consecutiveFailures < 10) return { level: 'warn', rate }
  return { level: 'danger', rate }
}

export default function KeyTable({
  items,
  filteredItems,
  hasSelectedGroup,
  itemsLoading,
  selectedIds,
  revealedIds,
  revealing,
  editingNotes,
  savingNotes,
  batchTestingItems,
  tableScrollRef,
  onSelectItem,
  onSelectAll,
  onRevealKey,
  onCopyKey,
  onToggleItem,
  onTestItem,
  onPriceConfig,
  onEditItem,
  onDeleteItem,
  onNotesChange,
  onSaveNotes,
  onCancelEditNotes,
}: KeyTableProps) {
  const allSelected = filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id))

  if (!hasSelectedGroup) {
    return <div className="text-center py-8 text-slate-400 text-sm">请先选择一个资源池</div>
  }

  if (itemsLoading) {
    return <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
        <div className="text-slate-300 text-2xl">ℹ️</div>
        <p className="text-sm">该资源池暂无 Key</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto" ref={tableScrollRef}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-2 py-2 w-8">
              <button onClick={onSelectAll} className="text-slate-400 hover:text-blue-600" title="全选">
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
            </th>
            <th className="px-2 py-2 text-xs font-medium text-slate-500 w-4">健康</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">Key</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">权重</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">优先级</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">售价</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">成功率</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">备注</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">状态</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <tr>
              <td colSpan={10} className="text-center py-8 text-slate-400 text-xs">无匹配记录</td>
            </tr>
          ) : (
            filteredItems.map(item => {
              const isRevealed = !!revealedIds[item.id]
              const isEditing = editingNotes[item.id] !== undefined
              const health = calcHealth(item)
              const isSelected = selectedIds.has(item.id)
              const isTesting = batchTestingItems.includes(item.id)
              return (
                <tr key={item.id} className={`hover:bg-slate-50 ${item.deletedAt ? 'opacity-50 bg-slate-50' : ''} ${isSelected ? 'bg-blue-50/50' : ''}`}>
                  {/* Checkbox */}
                  <td className="px-2 py-2">
                    {!item.deletedAt && (
                      <button onClick={() => onSelectItem(item.id)} className="text-slate-400 hover:text-blue-600">
                        {isSelected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                      </button>
                    )}
                  </td>
                  {/* Health indicator */}
                  <td className="px-2 py-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      title={
                        health.rate !== null
                          ? `成功率: ${health.rate.toFixed(1)}% | 连续失败: ${item.consecutiveFailures}`
                          : item.totalCalls > 0
                            ? `成功率: ${(item.successCalls / item.totalCalls * 100).toFixed(1)}%`
                            : item.totalCalls === 0 && item.consecutiveFailures === 0
                              ? '暂无数据'
                              : `连续失败: ${item.consecutiveFailures}`
                      }
                      style={{
                        backgroundColor:
                          health.level === 'healthy' ? '#22c55e' :
                          health.level === 'warn' ? '#eab308' :
                          '#ef4444'
                      }}
                    />
                  </td>
                  {/* Key */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-slate-700">
                        {isRevealed ? revealedIds[item.id] : (item.apiKeyPrefix || `#${item.id}`)}
                      </span>
                      {!item.deletedAt && (
                        <>
                          <button onClick={() => onRevealKey(item)}
                            className="p-0.5 text-slate-300 hover:text-blue-600 rounded" title={isRevealed ? '隐藏' : '查看完整 Key'}>
                            {revealing === item.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          {isRevealed && (
                            <button onClick={() => onCopyKey(revealedIds[item.id])}
                              className="p-0.5 text-slate-300 hover:text-green-600 rounded" title="复制完整 Key">
                              <Copy size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{item.weight}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{item.priority}</td>
                  {/* 售价 */}
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {item.sellPriceInput ? `¥${Number(item.sellPriceInput).toFixed(6)}入` : ''}
                    {item.sellPriceInput && item.sellPriceOutput ? ' / ' : ''}
                    {item.sellPriceOutput ? `¥${Number(item.sellPriceOutput).toFixed(6)}出` : ''}
                    {!item.sellPriceInput && !item.sellPriceOutput ? <span className="text-slate-300">—</span> : ''}
                  </td>
                  {/* 成功率 */}
                  <td className="px-3 py-2 text-xs">
                    {health.rate !== null ? (
                      <span className={`font-mono ${
                        health.level === 'healthy' ? 'text-green-600' :
                        health.level === 'warn' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {health.rate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400 italic" title={
                        item.totalCalls === 0 && item.consecutiveFailures === 0
                          ? '尚无调用数据'
                          : `总调用 ${item.totalCalls}，数据不足`
                      }>
                        {item.totalCalls === 0 && item.consecutiveFailures === 0
                          ? '—'
                          : '数据不足'}
                      </span>
                    )}
                  </td>
                  {/* 备注 */}
                  <td className="px-3 py-2">
                    {item.deletedAt ? (
                      <span className="text-xs text-slate-400 italic">已删除</span>
                    ) : isEditing ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={editingNotes[item.id] ?? ''}
                          onChange={e => onNotesChange(item.id, e.target.value)}
                          className="w-28 px-1.5 py-0.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-400 outline-none"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') onSaveNotes(item.id); if (e.key === 'Escape') onCancelEditNotes(item.id) }} />
                        <button onClick={() => onSaveNotes(item.id)} disabled={savingNotes[item.id]}
                          className="p-0.5 text-blue-500 hover:text-blue-700">
                          {savingNotes[item.id] ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        </button>
                        <button onClick={() => onCancelEditNotes(item.id)}
                          className="p-0.5 text-slate-300 hover:text-slate-500"><X size={12} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group cursor-pointer"
                        onClick={() => onNotesChange(item.id, item.notes ?? '')}>
                        <span className="text-xs text-slate-500 max-w-[120px] truncate">{item.notes || <span className="text-slate-300 italic">添加备注</span>}</span>
                        <Edit3 size={10} className="text-slate-200 group-hover:text-blue-500 shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* 状态 */}
                  <td className="px-3 py-2">
                    {item.deletedAt ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-orange-100 text-orange-600 rounded-full">
                        <Trash2 size={10} />已删除
                      </span>
                    ) : item.isDown ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                        <AlertCircle size={10} />宕机
                      </span>
                    ) : item.status ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                        <CheckCircle2 size={10} />正常
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full">禁用</span>
                    )}
                  </td>
                  {/* 操作 */}
                  <td className="px-3 py-2">
                    {item.deletedAt ? (
                      <span className="text-xs text-slate-400">{new Date(item.deletedAt).toLocaleDateString('zh-CN')}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => onToggleItem(item)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded" title={item.status && !item.isDown ? '禁用' : '启用'}>
                          {item.status && !item.isDown ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button onClick={() => onTestItem(item)}
                          className="p-1 text-slate-400 hover:text-green-600 rounded" title="测试连通性">
                          {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Cable size={14} />}
                        </button>
                        <button onClick={() => onPriceConfig(item)}
                          className="p-1 text-slate-400 hover:text-orange-600 rounded" title="模型价格配置">
                          <DollarSign size={14} />
                        </button>
                        <button onClick={() => onEditItem(item)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded" title="编辑">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => onDeleteItem(item)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded" title="删除">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}