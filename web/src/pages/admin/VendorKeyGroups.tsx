import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { Vendor } from '@/types'
import { Plus, Edit3, Trash2, Cable, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface KeyGroup {
  id: number; vendorId: number; name: string; strategy: string
  description: string | null; status: boolean; keyCount: number
  createdAt: string; updatedAt: string
}

interface KeyItem {
  id: number; groupId: number; apiKeyPrefix: string | null; weight: number
  priority: number; status: boolean; isDown: boolean
  consecutiveFailures: number; totalCalls: number; successCalls: number
  sellPriceInput: string | null; sellPriceOutput: string | null
  costPriceInput: string | null; costPriceOutput: string | null
  lastUsedAt: string | null; createdAt: string
}

export default function VendorKeyGroups() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null)
  const [groups, setGroups] = useState<KeyGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [items, setItems] = useState<KeyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Load vendors on mount ──
  useEffect(() => {
    get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 })
      .then(data => setVendors(Array.isArray(data?.list) ? data.list : []))
      .catch(() => {})
  }, [])

  // ── Load key groups for selected vendor ──
  const loadGroups = useCallback(async (vendorId: number) => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ data: KeyGroup[] }>(`/api/v1/admin/vendors/${vendorId}/key-groups`)
      setGroups(data.data || [])
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally { setLoading(false) }
  }, [])

  const loadItems = useCallback(async (groupId: number) => {
    setItemsLoading(true)
    try {
      const data = await get<{ data: KeyItem[] }>(`/api/v1/admin/key-groups/${groupId}/items`)
      setItems(data.data || [])
    } catch (err: any) {
      setError(err.message || '加载Key列表失败')
    } finally { setItemsLoading(false) }
  }, [])

  // ── Vendor selection ──
  useEffect(() => {
    if (selectedVendorId) { setSelectedGroupId(null); setItems([]); loadGroups(selectedVendorId) }
  }, [selectedVendorId, loadGroups])

  useEffect(() => {
    if (selectedGroupId) loadItems(selectedGroupId)
  }, [selectedGroupId, loadItems])

  // ── Group CRUD ──
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [editGroup, setEditGroup] = useState<KeyGroup | null>(null)
  const [groupForm, setGroupForm] = useState({ name: '', strategy: 'round_robin', description: '' })
  const [groupSubmitting, setGroupSubmitting] = useState(false)

  const handleCreateGroup = async () => {
    if (!selectedVendorId || !groupForm.name) return
    setGroupSubmitting(true)
    try {
      await post(`/api/v1/admin/vendors/${selectedVendorId}/key-groups`, groupForm)
      setShowCreateGroup(false); setGroupForm({ name: '', strategy: 'round_robin', description: '' })
      loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
    finally { setGroupSubmitting(false) }
  }

  const handleUpdateGroup = async () => {
    if (!editGroup) return
    setGroupSubmitting(true)
    try {
      await patch(`/api/v1/admin/key-groups/${editGroup.id}`, {
        name: groupForm.name, strategy: groupForm.strategy, description: groupForm.description || null,
      })
      setEditGroup(null); setGroupForm({ name: '', strategy: 'round_robin', description: '' })
      if (selectedVendorId) loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
    finally { setGroupSubmitting(false) }
  }

  const handleDeleteGroup = async (g: KeyGroup) => {
    if (!confirm(`确定删除分组「${g.name}」？`)) return
    try {
      await del(`/api/v1/admin/key-groups/${g.id}`)
      if (selectedGroupId === g.id) { setSelectedGroupId(null); setItems([]) }
      if (selectedVendorId) loadGroups(selectedVendorId)
    } catch (err: any) { setError(err.message) }
  }

  // ── Item CRUD ──
  const [showCreateItem, setShowCreateItem] = useState(false)
  const [editItem, setEditItem] = useState<KeyItem | null>(null)
  const emptyItemForm = { apiKey: '', weight: 1, priority: 0,
    costPriceInput: '', costPriceOutput: '', sellPriceInput: '', sellPriceOutput: '' }
  const [itemForm, setItemForm] = useState(emptyItemForm)
  const [itemSubmitting, setItemSubmitting] = useState(false)

  const openCreateItem = () => { setEditItem(null); setItemForm(emptyItemForm); setShowCreateItem(true) }
  const openEditItem = (item: KeyItem) => {
    setEditItem(item)
    setItemForm({
      apiKey: '',
      weight: item.weight, priority: item.priority,
      costPriceInput: item.costPriceInput ?? '', costPriceOutput: item.costPriceOutput ?? '',
      sellPriceInput: item.sellPriceInput ?? '', sellPriceOutput: item.sellPriceOutput ?? '',
    })
    setShowCreateItem(true)
  }

  const handleSaveItem = async () => {
    if (!selectedGroupId) return
    setItemSubmitting(true)
    try {
      const body: any = { weight: itemForm.weight, priority: itemForm.priority }
      if (itemForm.costPriceInput) body.costPriceInput = parseFloat(itemForm.costPriceInput)
      if (itemForm.costPriceOutput) body.costPriceOutput = parseFloat(itemForm.costPriceOutput)
      if (itemForm.sellPriceInput) body.sellPriceInput = parseFloat(itemForm.sellPriceInput)
      if (itemForm.sellPriceOutput) body.sellPriceOutput = parseFloat(itemForm.sellPriceOutput)

      if (editItem) {
        await patch(`/api/v1/admin/key-group-items/${editItem.id}`, body)
      } else {
        body.apiKey = itemForm.apiKey
        await post(`/api/v1/admin/key-groups/${selectedGroupId}/items`, body)
      }
      setShowCreateItem(false); setEditItem(null); setItemForm(emptyItemForm)
      loadItems(selectedGroupId)
    } catch (err: any) { setError(err.message) }
    finally { setItemSubmitting(false) }
  }

  const handleDeleteItem = async (item: KeyItem) => {
    if (!confirm(`确定删除Key #${item.id}？`)) return
    try {
      await del(`/api/v1/admin/key-group-items/${item.id}`)
      loadItems(selectedGroupId!)
    } catch (err: any) { setError(err.message) }
  }

  const handleTestItem = async (item: KeyItem) => {
    try {
      const data = await post<{ data: { success: boolean; durationMs: number } }>(
        `/api/v1/admin/key-group-items/${item.id}/test`)
      alert(data.data.success ? `连接成功 (${data.data.durationMs}ms)` : `连接失败 (${data.data.durationMs}ms)`)
    } catch (err: any) { alert('测试失败: ' + err.message) }
  }

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Key 分组管理</h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm bg-red-50 text-red-600 rounded-lg">
          <AlertCircle size={16} />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* ── Vendor Selector ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">选择供应商</label>
        <select
          value={selectedVendorId ?? ''}
          onChange={e => setSelectedVendorId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- 请选择 --</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {selectedVendor && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* ── Left: Key Groups ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">资源池</h2>
              <button onClick={() => { setEditGroup(null); setGroupForm({ name: '', strategy: 'round_robin', description: '' }); setShowCreateGroup(true) }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Plus size={14} />新建
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">暂无资源池</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {groups.map(g => (
                  <div key={g.id}
                    className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition ${selectedGroupId === g.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedGroupId(g.id)}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${g.status ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className="text-sm font-medium text-slate-900">{g.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {g.strategy === 'round_robin' ? '轮询' : g.strategy === 'weighted' ? '加权' : g.strategy === 'failover' ? '故障转移' : g.strategy}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{g.keyCount} 个 Key {g.description ? `| ${g.description}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditGroup(g); setGroupForm({ name: g.name, strategy: g.strategy, description: g.description ?? '' }); setShowCreateGroup(true) }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded"><Edit3 size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g) }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Key Items ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">
                {selectedGroupId ? `Key 列表` : `Key 列表`}
              </h2>
              {selectedGroupId && (
                <button onClick={openCreateItem}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus size={14} />新增 Key
                </button>
              )}
            </div>

            {!selectedGroupId ? (
              <div className="text-center py-8 text-slate-400 text-sm">请先选择一个资源池</div>
            ) : itemsLoading ? (
              <div className="text-center py-8"><Loader2 className="animate-spin inline-block" size={24} /></div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">该资源池暂无 Key</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">Key</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">权重</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">优先级</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">售价入</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">售价出</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">调用</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">状态</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs font-mono text-slate-700">{item.apiKeyPrefix || `#${item.id}`}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{item.weight}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{item.priority}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {item.sellPriceInput ? `¥${Number(item.sellPriceInput).toFixed(6)}` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {item.sellPriceOutput ? `¥${Number(item.sellPriceOutput).toFixed(6)}` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{item.totalCalls}</td>
                        <td className="px-3 py-2">
                          {item.isDown ? (
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
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleTestItem(item)}
                              className="p-1 text-slate-400 hover:text-green-600 rounded" title="测试连通性">
                              <Cable size={14} />
                            </button>
                            <button onClick={() => openEditItem(item)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded" title="编辑">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDeleteItem(item)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded" title="删除">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Group Modal ── */}
      {(showCreateGroup || editGroup) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowCreateGroup(false); setEditGroup(null) }}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editGroup ? '编辑资源池' : '新建资源池'}</h2>
                <button onClick={() => { setShowCreateGroup(false); setEditGroup(null) }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">名称 <span className="text-red-500">*</span></label>
                  <input type="text" value={groupForm.name}
                    onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="如 资源池1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">路由策略</label>
                  <select value={groupForm.strategy}
                    onChange={e => setGroupForm(f => ({ ...f, strategy: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="round_robin">轮询 (round_robin)</option>
                    <option value="weighted">加权 (weighted)</option>
                    <option value="failover">故障转移 (failover)</option>
                    <option value="priority">优先级 (priority)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">描述</label>
                  <input type="text" value={groupForm.description}
                    onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="可选"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setShowCreateGroup(false); setEditGroup(null) }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
                <button onClick={editGroup ? handleUpdateGroup : handleCreateGroup} disabled={groupSubmitting || !groupForm.name}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {groupSubmitting && <Loader2 className="animate-spin" size={14} />}
                  {editGroup ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Modal ── */}
      {showCreateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateItem(false)}>
          <div className="bg-white rounded-xl w-full max-w-xl shadow-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editItem ? '编辑 Key' : '新增 Key'}</h2>
                <button onClick={() => setShowCreateItem(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>

              {!editItem && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">API Key <span className="text-red-500">*</span></label>
                  <input type="password" value={itemForm.apiKey}
                    onChange={e => setItemForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  {editItem && <p className="text-xs text-slate-400 mt-1">创建后不可修改</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">权重</label>
                  <input type="number" min="0" value={itemForm.weight}
                    onChange={e => setItemForm(f => ({ ...f, weight: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">优先级</label>
                  <input type="number" min="0" value={itemForm.priority}
                    onChange={e => setItemForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                <p className="text-xs font-medium text-slate-500">价格设置（可选，留空则沿用通道配置）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">成本价 (输入)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.costPriceInput}
                      onChange={e => setItemForm(f => ({ ...f, costPriceInput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">成本价 (输出)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.costPriceOutput}
                      onChange={e => setItemForm(f => ({ ...f, costPriceOutput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">售价 (输入)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.sellPriceInput}
                      onChange={e => setItemForm(f => ({ ...f, sellPriceInput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">售价 (输出)</label>
                    <input type="number" step="0.000001" min="0" value={itemForm.sellPriceOutput}
                      onChange={e => setItemForm(f => ({ ...f, sellPriceOutput: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowCreateItem(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
                <button onClick={handleSaveItem} disabled={itemSubmitting || (!editItem && !itemForm.apiKey)}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {itemSubmitting && <Loader2 className="animate-spin" size={14} />}
                  {editItem ? '保存' : '新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
