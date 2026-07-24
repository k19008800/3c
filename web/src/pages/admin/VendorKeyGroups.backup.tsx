import { useState, useEffect } from 'react'
import { Plus, Edit3, Trash2, Cable, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useVendors, useKeyGroups, useKeyItems } from './vendor-key-groups/hooks'
import type { KeyGroup } from './vendor-key-groups/types'

export default function VendorKeyGroups() {
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const { vendors, summaries, loading: vendorsLoading } = useVendors()
  const {
    groups,
    loading: groupsLoading,
    error: groupsError,
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  } = useKeyGroups(selectedVendorId)
  const {
    items,
    total,
    page,
    pageSize,
    loading: itemsLoading,
    error: itemsError,
    searchQuery,
    statusTab,
    showDeleted,
    setPage,
    setSearchQuery,
    setStatusTab,
    setShowDeleted,
    loadItems,
    toggleStatus,
    deleteItem,
  } = useKeyItems(selectedGroupId)

  // 加载分组
  useEffect(() => {
    if (selectedVendorId) loadGroups()
  }, [selectedVendorId, loadGroups])

  // 加载 Key 列表
  useEffect(() => {
    if (selectedGroupId) loadItems()
  }, [selectedGroupId, loadItems])

  // Modal 状态
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [editGroup, setEditGroup] = useState<KeyGroup | null>(null)
  const [showCreateKey, setShowCreateKey] = useState(false)

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)
  const selectedGroup = groups.find(g => g.id === selectedGroupId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">供应商 Key 资源池</h1>
        <div className="flex gap-2">
          {selectedVendorId && (
            <button
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} />
              新建分组
            </button>
          )}
          {selectedGroupId && (
            <button
              onClick={() => setShowCreateKey(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Plus size={16} />
              添加 Key
            </button>
          )}
        </div>
      </div>

      {/* Vendor Selector */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <label className="block text-xs text-slate-500 mb-2">选择供应商</label>
        {vendorsLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin" size={16} />
            加载中...
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {vendors.map(vendor => {
              const summary = summaries.find(s => s.vendorId === vendor.id)
              const isSelected = selectedVendorId === vendor.id
              return (
                <button
                  key={vendor.id}
                  onClick={() => {
                    setSelectedVendorId(vendor.id)
                    setSelectedGroupId(null)
                  }}
                  className={`p-3 rounded-lg border text-left transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-sm">{vendor.name}</div>
                  {summary && (
                    <div className="text-xs text-slate-500 mt-1">
                      {summary.groupCount} 分组 / {summary.keyCount} Key
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Groups & Items */}
      {selectedVendorId && (
        <div className="grid grid-cols-4 gap-6">
          {/* Group List */}
          <div className="col-span-1 bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold mb-3">Key 分组</h3>
            {groupsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : groupsError ? (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle size={16} />
                {groupsError}
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-8">
                暂无分组
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(group => {
                  const isSelected = selectedGroupId === group.id
                  return (
                    <button
                      key={group.id}
                      onClick={() => setSelectedGroupId(group.id)}
                      className={`w-full p-3 rounded-lg border text-left transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{group.name}</span>
                        {group.status ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : (
                          <AlertCircle size={14} className="text-slate-400" />
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {group.keyCount} Key ({group.activeCount} 活跃)
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Key List */}
          <div className="col-span-3 bg-white rounded-xl shadow-sm border border-slate-200">
            {selectedGroupId ? (
              <>
                {/* Filters */}
                <div className="p-4 border-b border-slate-200">
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索 Key..."
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <select
                      value={statusTab}
                      onChange={(e) => setStatusTab(e.target.value as any)}
                      className="px-3 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value="all">全部</option>
                      <option value="active">活跃</option>
                      <option value="down">故障</option>
                      <option value="disabled">禁用</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => setShowDeleted(e.target.checked)}
                      />
                      显示已删除
                    </label>
                  </div>
                </div>

                {/* Table */}
                {itemsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : itemsError ? (
                  <div className="flex items-center gap-2 text-red-600 text-sm p-4">
                    <AlertCircle size={16} />
                    {itemsError}
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center text-slate-500 py-16">暂无 Key</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left">Key</th>
                          <th className="px-4 py-3 text-left">状态</th>
                          <th className="px-4 py-3 text-left">健康度</th>
                          <th className="px-4 py-3 text-left">调用</th>
                          <th className="px-4 py-3 text-left">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-xs">
                              {item.apiKeyPrefix || '—'}
                            </td>
                            <td className="px-4 py-3">
                              {item.isDown ? (
                                <span className="text-red-600">故障</span>
                              ) : item.status ? (
                                <span className="text-green-600">活跃</span>
                              ) : (
                                <span className="text-slate-400">禁用</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {item.totalCalls < 10 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <span>
                                  {((item.successCalls / item.totalCalls) * 100).toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {item.totalCalls}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleStatus(item.id, item.status)}
                                  className="text-slate-500 hover:text-blue-600"
                                >
                                  {item.status ? '禁用' : '启用'}
                                </button>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="text-slate-500 hover:text-red-600"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {total > pageSize && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                    <span className="text-sm text-slate-500">
                      共 {total} 条
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                      >
                        上一页
                      </button>
                      <span className="text-sm">{page}</span>
                      <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={page * pageSize >= total}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-slate-500 py-16">
                请选择一个分组查看 Key 列表
              </div>
            )}
          </div>
        </div>
      )}

      {/* TODO: Modals */}
    </div>
  )
}