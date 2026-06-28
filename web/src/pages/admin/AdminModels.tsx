import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { AdminModel, PaginatedData } from '@/types'
import {
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
} from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'chat', label: '对话', color: 'bg-blue-100 text-blue-700' },
  { value: 'embedding', label: '嵌入', color: 'bg-green-100 text-green-700' },
  { value: 'image', label: '图像', color: 'bg-purple-100 text-purple-700' },
  { value: 'audio', label: '音频', color: 'bg-orange-100 text-orange-700' },
] as const

const TYPE_MAP = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t]))

export default function AdminModels() {
  const [models, setModels] = useState<AdminModel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingModel, setEditingModel] = useState<AdminModel | null>(null)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (typeFilter) params.type = typeFilter
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<AdminModel>>('/api/v1/admin/models', params)
      setModels(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取模型列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, typeFilter, statusFilter])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await del(`/api/v1/admin/models/${id}`)
      setDeletingId(null)
      fetchModels()
    } catch (err: any) {
      setError(err.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">模型管理</h1>
        <button
          onClick={() => { setEditingModel(null); setShowFormModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          新增模型
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">搜索</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                placeholder="搜索模型名称"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">类型</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">停用</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">显示名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无模型数据
                  </td>
                </tr>
              ) : (
                models.map((m) => {
                  const typeInfo = TYPE_MAP[m.type]
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-sm text-slate-600">{m.id}</td>
                      <td className="px-4 py-3 text-sm text-slate-900 font-mono">{m.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{m.displayName || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo?.color || 'bg-slate-100 text-slate-700'}`}>
                          {typeInfo?.label || m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {m.status ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingModel(m); setShowFormModal(true) }}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                          >
                            <Pencil size={14} />
                            编辑
                          </button>
                          <button
                            onClick={() => setDeletingId(m.id)}
                            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showFormModal && (
        <ModelFormModal
          model={editingModel}
          onClose={() => { setShowFormModal(false); setEditingModel(null) }}
          onSaved={() => { setShowFormModal(false); setEditingModel(null); fetchModels() }}
          saving={saving}
          setSaving={setSaving}
        />
      )}

      {/* Delete Confirmation */}
      {deletingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">确认删除</h3>
            <p className="text-sm text-slate-600 mb-6">
              确定要删除该模型吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelFormModal({
  model,
  onClose,
  onSaved,
  saving,
  setSaving,
}: {
  model: AdminModel | null
  onClose: () => void
  onSaved: () => void
  saving: boolean
  setSaving: (v: boolean) => void
}) {
  const isEdit = !!model
  const [name, setName] = useState(model?.name || '')
  const [displayName, setDisplayName] = useState(model?.displayName || '')
  const [type, setType] = useState(model?.type || 'chat')
  const [status, setStatus] = useState(model?.status ?? true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setMessage('')
    setError('')

    if (!name.trim()) {
      setError('模型名称不能为空')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        const body: any = {}
        if (name !== model.name) body.name = name
        if (displayName !== (model.displayName || '')) body.displayName = displayName || undefined
        if (type !== model.type) body.type = type
        if (status !== model.status) body.status = status
        await patch(`/api/v1/admin/models/${model.id}`, body)
        setMessage('模型已更新')
      } else {
        await post('/api/v1/admin/models', {
          name: name.trim(),
          displayName: displayName.trim() || undefined,
          type,
        })
        setMessage('模型已创建')
      }
      setTimeout(onSaved, 800)
    } catch (err: any) {
      setError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEdit ? '编辑模型' : '新增模型'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                模型名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：gpt-4o"
                disabled={isEdit}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              />
              {isEdit && (
                <p className="text-xs text-slate-400 mt-1">创建后不可修改</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">显示名称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：GPT-4o"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                类型 <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isEdit}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {isEdit && (
                <p className="text-xs text-slate-400 mt-1">创建后不可修改</p>
              )}
            </div>

            {isEdit && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">状态</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStatus(true)}
                    className={`px-4 py-2 text-sm rounded-lg border transition ${
                      status
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    启用
                  </button>
                  <button
                    onClick={() => setStatus(false)}
                    className={`px-4 py-2 text-sm rounded-lg border transition ${
                      !status
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    停用
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? (isEdit ? '更新中...' : '创建中...') : (isEdit ? '保存' : '创建')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
