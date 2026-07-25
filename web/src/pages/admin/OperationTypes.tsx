// ── 操作类型管理页面 ──

import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { OperationType, OperationTypeCategory, OperationTypeStats, PaginatedData } from '@/types'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Plus,
  Search,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Trash2,
  AlertCircle,
  Settings,
  CheckCircle,
  XCircle,
} from 'lucide-react'

// ── 分类配置 ──

const CATEGORY_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  auth: { label: '认证类', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  api_key: { label: 'API 类', color: 'text-green-700', bgColor: 'bg-green-50' },
  finance: { label: '财务类', color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  profile: { label: '资料类', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  agent: { label: '代理类', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  system: { label: '系统类', color: 'text-red-700', bgColor: 'bg-red-50' },
}

// ── 对话框组件 ──

interface FormDialogProps {
  mode: 'create' | 'edit'
  item?: OperationType | null
  categories: Record<string, OperationTypeCategory>
  onClose: () => void
  onSubmit: (data: { name: string; category: string; description?: string; enabled?: boolean }) => Promise<void>
}

function FormDialog({ mode, item, categories, onClose, onSubmit }: FormDialogProps) {
  const [name, setName] = useState(item?.name || '')
  const [category, setCategory] = useState(item?.category || 'auth')
  const [description, setDescription] = useState(item?.description || '')
  const [enabled, setEnabled] = useState(item?.enabled ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSubmit({ name, category, description: description || undefined, enabled })
      onClose()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-lg font-semibold mb-4">
          {mode === 'create' ? '创建操作类型' : '编辑操作类型'}
        </h2>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="如：login, key_create, recharge"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              分类 <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {Object.entries(categories).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label} ({key})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder="操作类型说明"
            />
          </div>

          {mode === 'edit' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="enabled" className="text-sm text-slate-700">
                启用
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? '处理中...' : mode === 'create' ? '创建' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 主页面 ──

export default function OperationTypes() {
  const [list, setList] = useState<OperationType[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<Record<string, OperationTypeCategory>>({})
  const [stats, setStats] = useState<OperationTypeStats | null>(null)

  // 筛选条件
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [enabledFilter, setEnabledFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 对话框
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogItem, setDialogItem] = useState<OperationType | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  // ── 获取列表 ──
  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (categoryFilter) params.category = categoryFilter
      if (enabledFilter) params.enabled = enabledFilter

      const data = await get<PaginatedData<OperationType> & { categories: Record<string, OperationTypeCategory> }>(
        '/api/v1/admin/operation-types',
        params
      )
      setList(data.list)
      setTotal(data.total)
      if (data.categories) setCategories(data.categories)
    } catch (err: any) {
      setError(err.message || '获取操作类型列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword, categoryFilter, enabledFilter])

  // ── 获取统计 ──
  const fetchStats = useCallback(async () => {
    try {
      const data = await get<OperationTypeStats>('/api/v1/admin/operation-types/stats')
      setStats(data)
    } catch (err) {
      console.error('获取统计失败:', err)
    }
  }, [])

  useEffect(() => {
    fetchList()
    fetchStats()
  }, [fetchList, fetchStats])

  // ── 创建 ──
  const handleCreate = async (data: { name: string; category: string; description?: string; enabled?: boolean }) => {
    await post('/api/v1/admin/operation-types', data)
    fetchList()
    fetchStats()
  }

  // ── 编辑 ──
  const handleEdit = async (data: { name: string; category: string; description?: string; enabled?: boolean }) => {
    if (!dialogItem) return
    await patch(`/api/v1/admin/operation-types/${dialogItem.id}`, data)
    fetchList()
    fetchStats()
  }

  // ── 删除 ──
  const handleDelete = async (item: OperationType) => {
    if (item.isSystem) {
      alert('系统内置操作类型不可删除')
      return
    }
    if (!confirm(`确定删除操作类型 "${item.name}" 吗？`)) return

    try {
      await del(`/api/v1/admin/operation-types/${item.id}`)
      fetchList()
      fetchStats()
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  // ── 切换启用状态 ──
  const handleToggle = async (item: OperationType) => {
    try {
      await post(`/api/v1/admin/operation-types/${item.id}/toggle`, {})
      fetchList()
      fetchStats()
    } catch (err: any) {
      alert(err.message || '操作失败')
    }
  }

  // ── 初始化默认类型 ──
  const handleInitDefaults = async () => {
    if (!confirm('确定初始化默认操作类型吗？已存在的类型不会被覆盖。')) return

    try {
      const result = await post<{ created: number; items: any[] }>('/api/v1/admin/operation-types/init-defaults', {})
      alert(result.message || `成功创建 ${result.created} 个操作类型`)
      fetchList()
      fetchStats()
    } catch (err: any) {
      alert(err.message || '初始化失败')
    }
  }

  // ── 打开创建对话框 ──
  const openCreateDialog = () => {
    setDialogMode('create')
    setDialogItem(null)
    setShowDialog(true)
  }

  // ── 打开编辑对话框 ──
  const openEditDialog = (item: OperationType) => {
    setDialogMode('edit')
    setDialogItem(item)
    setShowDialog(true)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">操作类型管理</h1>
          <FeatureDescription page="admin/operation-types" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <button
            onClick={handleInitDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Settings size={14} />
            初始化默认类型
          </button>
          <button
            onClick={() => {
              setPage(1)
              fetchList()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <button
            onClick={openCreateDialog}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 transition"
          >
            <Plus size={14} />
            新建
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">总数</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">已启用</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.enabled}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">已禁用</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{stats.disabled}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">系统内置</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{stats.system}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchList())}
                placeholder="搜索操作类型名称..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">全部分类</option>
            {Object.entries(CATEGORY_LABELS).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
          <select
            value={enabledFilter}
            onChange={(e) => {
              setEnabledFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">全部状态</option>
            <option value="true">已启用</option>
            <option value="false">已禁用</option>
          </select>
          <button
            onClick={() => {
              setKeyword('')
              setCategoryFilter('')
              setEnabledFilter('')
              setPage(1)
            }}
            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            重置
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">分类</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">描述</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">创建时间</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    加载中...
                  </div>
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  暂无数据，点击"初始化默认类型"添加系统内置操作类型
                </td>
              </tr>
            ) : (
              list.map((item) => {
                const catCfg = CATEGORY_LABELS[item.category] || {
                  label: item.category,
                  color: 'text-slate-700',
                  bgColor: 'bg-slate-50',
                }
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">{item.id}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-900">{item.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${catCfg.bgColor} ${catCfg.color}`}>
                        {catCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                      {item.description || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.enabled ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle size={14} />
                          启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                          <XCircle size={14} />
                          禁用
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.isSystem ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          系统
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-700">
                          自定义
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(item)}
                          className={`p-1.5 rounded hover:bg-slate-100 ${item.enabled ? 'text-green-600' : 'text-red-600'}`}
                          title={item.enabled ? '点击禁用' : '点击启用'}
                        >
                          {item.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button
                          onClick={() => openEditDialog(item)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                        {!item.isSystem && (
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            第 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* Dialog */}
      {showDialog && (
        <FormDialog
          mode={dialogMode}
          item={dialogItem}
          categories={categories}
          onClose={() => setShowDialog(false)}
          onSubmit={dialogMode === 'create' ? handleCreate : handleEdit}
        />
      )}
    </div>
  )
}
