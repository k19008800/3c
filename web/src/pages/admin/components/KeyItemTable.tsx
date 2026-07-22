/**
 * KeyItemTable - Key 条目表格组件
 * 从 VendorKeyGroups.tsx 拆分，负责 Key 列表展示、筛选、分页
 */
import { useState, useMemo, useCallback, memo } from 'react'
import {
  Edit3, Trash2, Cable, CheckCircle2, AlertCircle, Loader2,
  DollarSign, RefreshCw, ToggleLeft, ToggleRight, Eye, EyeOff,
  Search, Square, CheckSquare, Copy, FileText,
} from 'lucide-react'
import { patch, del, post } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'

export interface KeyItem {
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

type StatusTab = 'all' | 'active' | 'down' | 'disabled' | 'deleted'

/** 计算健康状态 */
function calcHealth(item: KeyItem): { level: 'healthy' | 'warn' | 'danger'; rate: number | null } {
  if (item.totalCalls < 10) return { level: 'warn', rate: null }
  const rate = item.totalCalls > 0 ? (item.successCalls / item.totalCalls) * 100 : 0
  if (rate >= 90 && item.consecutiveFailures < 3) return { level: 'healthy', rate }
  if (rate >= 70 && item.consecutiveFailures < 10) return { level: 'warn', rate }
  return { level: 'danger', rate }
}

interface KeyItemTableProps {
  groupId: number | null
  items: KeyItem[]
  loading: boolean
  onRefresh: () => void
  onError: (msg: string) => void
  onEdit: (item: KeyItem) => void
  onPriceConfig: (item: KeyItem) => void
  onReveal: (id: number) => Promise<string | null>
}

function KeyItemTable({
  groupId,
  items,
  loading,
  onRefresh,
  onError,
  onEdit,
  onPriceConfig,
  onReveal,
}: KeyItemTableProps) {
  // ── Pagination ──
  const [page, setPage] = useState(1)
  const pageSize = 20

  // ── Filter ──
  const [searchQuery, setSearchQuery] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [revealedKeys, setRevealedKeys] = useState<Record<number, string>>({})

  // ── Filtered items ──
  const filteredItems = useMemo(() => {
    let list = items.filter(i => !i.deletedAt)
    if (statusTab === 'active') list = list.filter(i => i.status && !i.isDown)
    else if (statusTab === 'down') list = list.filter(i => i.isDown)
    else if (statusTab === 'disabled') list = list.filter(i => !i.status)
    else if (statusTab === 'deleted') list = items.filter(i => i.deletedAt)

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(i =>
        (i.apiKeyPrefix && i.apiKeyPrefix.toLowerCase().includes(q)) ||
        String(i.id).includes(q) ||
        (i.notes && i.notes.toLowerCase().includes(q))
      )
    }
    return list
  }, [items, statusTab, searchQuery])

  // ── Paginated items ──
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, page])

  // ── Stats ──
  const stats = useMemo(() => {
    const active = items.filter(i => i.status && !i.isDown && !i.deletedAt)
    const down = items.filter(i => i.isDown && !i.deletedAt)
    const disabled = items.filter(i => !i.status && !i.deletedAt)
    const deleted = items.filter(i => i.deletedAt)
    return {
      total: active.length + down.length + disabled.length,
      active: active.length,
      down: down.length,
      disabled: disabled.length,
      deleted: deleted.length,
    }
  }, [items])

  // ── Handlers ──
  const handleToggle = async (item: KeyItem) => {
    try {
      await patch(`/api/v1/admin/key-group-items/${item.id}`, { status: !item.status })
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    }
  }

  const handleDelete = async (item: KeyItem) => {
    if (!confirm('确定删除此 Key?')) return
    try {
      await del(`/api/v1/admin/key-group-items/${item.id}`)
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    }
  }

  const handleRestore = async (item: KeyItem) => {
    try {
      await patch(`/api/v1/admin/key-group-items/${item.id}`, { deletedAt: null })
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    }
  }

  const handleTest = async (item: KeyItem) => {
    try {
      const data = await post<{ data: { success: boolean; durationMs: number } }>(
        `/api/v1/admin/key-group-items/${item.id}/test`)
      alert(data.data.success ? `连通性测试通过 (${data.data.durationMs}ms)` : '连通性测试失败')
    } catch (err: any) {
      onError('测试失败: ' + err.message)
    }
  }

  const handleReveal = async (item: KeyItem) => {
    if (revealedKeys[item.id]) {
      setRevealedKeys(prev => { const next = { ...prev }; delete next[item.id]; return next })
      return
    }
    const key = await onReveal(item.id)
    if (key) setRevealedKeys(prev => ({ ...prev, [item.id]: key }))
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedItems.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(pagedItems.map(i => i.id)))
  }

  if (!groupId) {
    return (
      <div className="p-8 text-center text-gray-500">
        请先选择分组
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b bg-gray-50 text-xs">
        <div className="text-center">
          <div className="font-semibold text-gray-700">{stats.total}</div>
          <div className="text-gray-500">总计</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-green-600">{stats.active}</div>
          <div className="text-gray-500">可用</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-red-600">{stats.down}</div>
          <div className="text-gray-500">故障</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-gray-500">{stats.disabled}</div>
          <div className="text-gray-500">停用</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-gray-400">{stats.deleted}</div>
          <div className="text-gray-500">已删</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <div className="flex items-center gap-1 bg-gray-100 rounded px-1">
          {(['all', 'active', 'down', 'disabled'] as StatusTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setStatusTab(tab); setPage(1) }}
              className={`px-2 py-1 text-xs rounded ${
                statusTab === tab ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab === 'all' ? '全部' : tab === 'active' ? '可用' : tab === 'down' ? '故障' : '停用'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
            placeholder="搜索 Key / ID / 备注"
            className="w-full pl-8 pr-2 py-1 border rounded text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="animate-spin w-6 h-6 text-gray-400" />
          </div>
        ) : pagedItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr>
                <th className="w-8 px-2 py-2">
                  <button onClick={toggleSelectAll} className="p-0.5">
                    {selectedIds.size === pagedItems.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-gray-600">Key</th>
                <th className="px-2 py-2 text-left text-gray-600">状态</th>
                <th className="px-2 py-2 text-left text-gray-600">健康</th>
                <th className="px-2 py-2 text-left text-gray-600">权重/优先级</th>
                <th className="px-2 py-2 text-left text-gray-600">调用</th>
                <th className="px-2 py-2 text-left text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map(item => {
                const health = calcHealth(item)
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-2">
                      <button onClick={() => toggleSelect(item.id)} className="p-0.5">
                        {selectedIds.has(item.id) ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {revealedKeys[item.id] || item.apiKeyPrefix || '—'}
                      <button
                        onClick={() => handleReveal(item)}
                        className="ml-1 p-0.5 hover:bg-gray-200 rounded"
                        title="显示/隐藏"
                      >
                        {revealedKeys[item.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      {revealedKeys[item.id] && (
                        <button
                          onClick={() => handleCopy(revealedKeys[item.id])}
                          className="ml-1 p-0.5 hover:bg-gray-200 rounded"
                          title="复制"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {item.isDown ? (
                        <span className="text-red-600">故障</span>
                      ) : item.status ? (
                        <span className="text-green-600">可用</span>
                      ) : (
                        <span className="text-gray-500">停用</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {health.rate !== null ? (
                        <span className={
                          health.level === 'healthy' ? 'text-green-600' :
                          health.level === 'warn' ? 'text-yellow-600' : 'text-red-600'
                        }>
                          {health.rate.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {item.weight} / {item.priority}
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {item.totalCalls > 0 ? (
                        <span>{item.successCalls}/{item.totalCalls}</span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggle(item)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title={item.status ? '停用' : '启用'}
                        >
                          {item.status ? (
                            <ToggleRight className="w-4 h-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleTest(item)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="测试连通性"
                        >
                          <Cable className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button
                          onClick={() => onPriceConfig(item)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="价格配置"
                        >
                          <DollarSign className="w-3.5 h-3.5 text-green-600" />
                        </button>
                        {item.deletedAt ? (
                          <button
                            onClick={() => handleRestore(item)}
                            className="p-1 hover:bg-green-100 rounded"
                            title="恢复"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-green-600" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1 hover:bg-red-100 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t">
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={filteredItems.length}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}

export default memo(KeyItemTable)
