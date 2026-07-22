/**
 * KeyGroupPanel - 供应商 Key 分组面板
 * 从 VendorKeyGroups.tsx 拆分，负责分组列表展示和 CRUD
 */
import { useState } from 'react'
import { Plus, Edit3, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { post, patch, del } from '@/lib/api'

export interface KeyGroup {
  id: number
  vendorId: number
  name: string
  strategy: string
  description: string | null
  status: boolean
  keyCount: number
  activeCount: number
  downCount: number
  disabledCount: number
  createdAt: string
  updatedAt: string
}

interface KeyGroupPanelProps {
  vendorId: number | null
  groups: KeyGroup[]
  selectedGroupId: number | null
  onSelectGroup: (id: number | null) => void
  onRefresh: () => void
  onError: (msg: string) => void
}

export default function KeyGroupPanel({
  vendorId,
  groups,
  selectedGroupId,
  onSelectGroup,
  onRefresh,
  onError,
}: KeyGroupPanelProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [editGroup, setEditGroup] = useState<KeyGroup | null>(null)
  const [form, setForm] = useState({ name: '', strategy: 'round_robin', description: '' })
  const [submitting, setSubmitting] = useState(false)

  const handleCreate = async () => {
    if (!vendorId || !form.name) return
    setSubmitting(true)
    try {
      await post(`/api/v1/admin/vendors/${vendorId}/key-groups`, form)
      setShowCreate(false)
      setForm({ name: '', strategy: 'round_robin', description: '' })
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editGroup) return
    setSubmitting(true)
    try {
      await patch(`/api/v1/admin/key-groups/${editGroup.id}`, {
        name: form.name,
        strategy: form.strategy,
        description: form.description || null,
      })
      setEditGroup(null)
      setForm({ name: '', strategy: 'round_robin', description: '' })
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (g: KeyGroup) => {
    if (!confirm(`确定删除分组「${g.name}」？`)) return
    try {
      await del(`/api/v1/admin/key-groups/${g.id}`)
      if (selectedGroupId === g.id) onSelectGroup(null)
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    }
  }

  const handleToggle = async (g: KeyGroup) => {
    try {
      await patch(`/api/v1/admin/key-groups/${g.id}`, { status: !g.status })
      onRefresh()
    } catch (err: any) {
      onError(err.message)
    }
  }

  const openEdit = (g: KeyGroup) => {
    setEditGroup(g)
    setForm({ name: g.name, strategy: g.strategy, description: g.description || '' })
  }

  if (!vendorId) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        请先选择供应商
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <span className="font-medium text-sm">Key 分组</span>
        <button
          onClick={() => { setShowCreate(true); setForm({ name: '', strategy: 'round_robin', description: '' }) }}
          className="p-1 hover:bg-gray-200 rounded"
          title="新建分组"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {groups.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-4">暂无分组</div>
        ) : (
          groups.map(g => (
            <div
              key={g.id}
              onClick={() => onSelectGroup(g.id)}
              className={`p-2 rounded cursor-pointer transition-colors ${
                selectedGroupId === g.id
                  ? 'bg-blue-100 border border-blue-300'
                  : 'hover:bg-gray-100 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">{g.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(g) }}
                    className="p-0.5 hover:bg-gray-200 rounded"
                    title={g.status ? '停用' : '启用'}
                  >
                    {g.status ? (
                      <ToggleRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(g) }}
                    className="p-0.5 hover:bg-gray-200 rounded"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(g) }}
                    className="p-0.5 hover:bg-red-100 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {g.strategy} · {g.activeCount}/{g.keyCount} 可用
                {g.downCount > 0 && <span className="text-red-500 ml-1">({g.downCount} 故障)</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || editGroup) && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4">
            <h3 className="font-semibold mb-3">{editGroup ? '编辑分组' : '新建分组'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="分组名称"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">策略</label>
                <select
                  value={form.strategy}
                  onChange={(e) => setForm({ ...form, strategy: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="round_robin">轮询</option>
                  <option value="weighted">加权</option>
                  <option value="priority">优先级</option>
                  <option value="failover">故障转移</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="可选"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowCreate(false); setEditGroup(null) }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button
                onClick={editGroup ? handleUpdate : handleCreate}
                disabled={submitting || !form.name}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
