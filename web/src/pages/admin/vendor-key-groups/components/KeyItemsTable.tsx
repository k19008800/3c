import React, { memo } from 'react'
import type { KeyItem } from '../hooks/useVendorKeyGroups'
import {
  calcHealth,
  fmtDate,
  fmtPercent,
  fmtPrice,
  fmtApiKeyPrefix,
  fmtCalls,
  fmtWeight,
  getStatusLabel,
  getStatusColors
} from '../utils'
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit3,
  Trash2,
  Play,
  ToggleLeft,
  ToggleRight,
  RefreshCw
} from 'lucide-react'

interface KeyItemsTableProps {
  items: KeyItem[]
  selectedIds: Set<number>
  revealedIds: Record<number, string>
  editingNotes: Record<number, string>
  savingNotes: Record<number, boolean>
  loading: boolean
  onSelect: (id: number) => void
  onSelectAll: () => void
  onRevealKey: (item: KeyItem) => void
  onCopyKey: (fullKey: string) => void
  onToggleItem: (item: KeyItem) => void
  onTestItem: (item: KeyItem) => void
  onEditNotes: (itemId: number, notes: string) => void
  onSaveNotes: (itemId: number) => void
  onDeleteItem: (item: KeyItem) => void
}

const KeyItemsTable: React.FC<KeyItemsTableProps> = memo(({
  items,
  selectedIds,
  revealedIds,
  editingNotes,
  savingNotes,
  loading,
  onSelect,
  onSelectAll,
  onRevealKey,
  onCopyKey,
  onToggleItem,
  onTestItem,
  onEditNotes,
  onSaveNotes,
  onDeleteItem
}) => {
  if (loading && items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-2 text-slate-500">加载密钥中...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-400 mb-2">暂无密钥数据</div>
        <p className="text-sm text-slate-500">请在分组中创建密钥</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left border-b border-slate-200">
            <th className="py-3 px-4">
              <input
                type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                onChange={onSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th className="py-3 px-4 text-slate-500 font-medium">ID</th>
            <th className="py-3 px-4 text-slate-500 font-medium">API Key</th>
            <th className="py-3 px-4 text-slate-500 font-medium">健康状态</th>
            <th className="py-3 px-4 text-slate-500 font-medium">调用统计</th>
            <th className="py-3 px-4 text-slate-500 font-medium">价格配置</th>
            <th className="py-3 px-4 text-slate-500 font-medium">权重/优先级</th>
            <th className="py-3 px-4 text-slate-500 font-medium">最后使用</th>
            <th className="py-3 px-4 text-slate-500 font-medium">状态</th>
            <th className="py-3 px-4 text-slate-500 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(item => {
            const health = calcHealth(item)
            const statusColors = getStatusColors(item.status, item.isDown, item.deletedAt)
            const statusLabel = getStatusLabel(item.status, item.isDown, item.deletedAt)
            const isRevealed = revealedIds[item.id]
            const isEditingNotes = editingNotes[item.id] !== undefined
            const isSavingNotes = savingNotes[item.id]
            
            return (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                {/* Selection checkbox */}
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => onSelect(item.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                
                {/* ID */}
                <td className="py-3 px-4 font-mono text-xs">{item.id}</td>
                
                {/* API Key */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                      {isRevealed ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">{revealedIds[item.id]}</span>
                          <button
                            onClick={() => onCopyKey(revealedIds[item.id])}
                            className="text-blue-400 hover:text-blue-600"
                            title="复制"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      ) : (
                        fmtApiKeyPrefix(item.apiKeyPrefix)
                      )}
                    </div>
                    <button
                      onClick={() => onRevealKey(item)}
                      className="text-slate-400 hover:text-slate-600"
                      title={isRevealed ? '隐藏密钥' : '显示密钥'}
                    >
                      {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </td>
                
                {/* Health status */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${health.bgColor.replace('bg-', 'bg-')}`}></div>
                    <div>
                      <div className={`text-xs font-medium ${health.color}`}>
                        {health.label}
                      </div>
                      {health.rate !== null && (
                        <div className="text-xs text-slate-500">
                          {fmtPercent(health.rate)}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.consecutiveFailures > 0 && (
                    <div className="text-xs text-red-500 mt-1">
                      连续失败: {item.consecutiveFailures}
                    </div>
                  )}
                </td>
                
                {/* Call statistics */}
                <td className="py-3 px-4">
                  <div className="space-y-1">
                    <div className="text-xs">
                      {fmtCalls(item.totalCalls, item.successCalls)}
                    </div>
                    <div className="text-xs text-slate-500">
                      总调用: {item.totalCalls.toLocaleString()}
                    </div>
                  </div>
                </td>
                
                {/* Price configuration */}
                <td className="py-3 px-4">
                  <div className="space-y-1 text-xs">
                    <div>
                      成本: {fmtPrice(item.costPriceInput)}/{fmtPrice(item.costPriceOutput)}
                    </div>
                    <div>
                      售价: {fmtPrice(item.sellPriceInput)}/{fmtPrice(item.sellPriceOutput)}
                    </div>
                  </div>
                </td>
                
                {/* Weight/Priority */}
                <td className="py-3 px-4">
                  <div className="text-xs">
                    {fmtWeight(item.weight, item.priority)}
                  </div>
                </td>
                
                {/* Last used */}
                <td className="py-3 px-4 text-xs text-slate-500">
                  {fmtDate(item.lastUsedAt)}
                </td>
                
                {/* Status */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors.bgColor} ${statusColors.text}`}>
                      {statusLabel}
                    </span>
                    <button
                      onClick={() => onToggleItem(item)}
                      className="text-slate-400 hover:text-slate-600"
                      title={item.status ? '禁用' : '启用'}
                    >
                      {item.status ? (
                        <ToggleRight size={14} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={14} className="text-red-600" />
                      )}
                    </button>
                  </div>
                </td>
                
                {/* Actions */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1">
                    {/* Test button */}
                    <button
                      onClick={() => onTestItem(item)}
                      className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition"
                      title="测试连接"
                    >
                      <Play size={14} />
                    </button>
                    
                    {/* Edit notes */}
                    {isEditingNotes ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingNotes[item.id]}
                          onChange={(e) => onEditNotes(item.id, e.target.value)}
                          className="text-xs border border-slate-300 rounded px-2 py-1 w-32"
                          placeholder="备注"
                        />
                        <button
                          onClick={() => onSaveNotes(item.id)}
                          disabled={isSavingNotes}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {isSavingNotes ? '保存中...' : '保存'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onEditNotes(item.id, item.notes || '')}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                        title="编辑备注"
                      >
                        <Edit3 size={14} />
                      </button>
                    )}
                    
                    {/* Delete button */}
                    <button
                      onClick={() => onDeleteItem(item)}
                      className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})

KeyItemsTable.displayName = 'KeyItemsTable'

export default KeyItemsTable