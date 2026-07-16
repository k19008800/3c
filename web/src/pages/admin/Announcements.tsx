import { useEffect, useState, useCallback } from 'react'
import { get, post, patch, del } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import {
  Loader2, AlertCircle, Plus, Pencil, Trash2, CheckCircle2,
  Megaphone, Eye, EyeOff,
} from 'lucide-react'

interface Announcement {
  id: number
  title: string
  content: string
  type: string
  status: boolean
  priority: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

const emptyForm = { title: '', content: '', type: 'system_announcement', priority: 0 }

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // ── 持久化筛选 ──
  const { filters, setFilter, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-announcements',
    defaults: { keyword: '', page: 1, pageSize: 20 },
  })
  const { keyword, page, pageSize } = filters as { keyword: string; page: number; pageSize: number }
  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      const data = await get<PaginatedData<Announcement>>('/api/v1/admin/announcements', params)
      setAnnouncements(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取公告列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleStatus = async (item: Announcement) => {
    try {
      await patch(`/api/v1/admin/announcements/${item.id}`, { status: !item.status })
      fetchData()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await del(`/api/v1/admin/announcements/${deleteId}`)
      setDeleteId(null)
      fetchData()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">公告管理</h1>
        <FeatureDescription page="admin/announcements" className="ml-2" />
        <button
          onClick={() => { setEditing(null); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          发布公告
        </button>
      </div>

      {/* Filters — 持久化筛选栏 */}
      <FilterBar
        filters={{ keyword }}
        setFilter={(key, value) => setFilter(key as any, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={fetchData}
        fields={[
          { key: 'keyword', label: '搜索', type: 'text', placeholder: '搜索公告标题' },
        ]}
      />

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
                <th className="px-4 py-3 text-sm font-medium text-slate-500">标题</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">优先级</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建人</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : announcements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">暂无公告</td>
                </tr>
              ) : (
                announcements.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{item.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium max-w-[240px] truncate">
                      <div className="flex items-center gap-2">
                        <Megaphone size={14} className="text-indigo-500 shrink-0" />
                        <span>{item.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">
                        {item.type === 'system_announcement' ? '全站公告' : item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.priority >= 5
                          ? 'bg-red-100 text-red-700'
                          : item.priority >= 2
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleStatus(item)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                          item.status
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {item.status ? <Eye size={12} /> : <EyeOff size={12} />}
                        {item.status ? '已发布' : '已下架'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.createdBy || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditing(item); setShowModal(true) }}
                          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                        >
                          <Pencil size={14} />
                          编辑
                        </button>
                        <button
                          onClick={() => setDeleteId(item.id)}
                          className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={14} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={(p) => setFilter('page', p)}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setFilter('pageSize', s); setFilter('page', 1) }}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <AnnouncementFormModal
          announcement={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSuccess={() => { setShowModal(false); setEditing(null); fetchData() }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">确认删除</h3>
            <p className="text-sm text-slate-600 mb-6">确定要删除该公告吗？此操作不可撤销。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnnouncementFormModal({
  announcement,
  onClose,
  onSuccess,
}: {
  announcement: Announcement | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!announcement
  const [form, setForm] = useState(
    isEdit
      ? { title: announcement.title, content: announcement.content, type: announcement.type, priority: announcement.priority }
      : { ...emptyForm }
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setMessage('')
    setError('')
    if (!form.title.trim()) { setError('请输入公告标题'); return }
    if (!form.content.trim()) { setError('请输入公告内容'); return }

    setSaving(true)
    try {
      if (isEdit) {
        const body: any = {}
        if (form.title !== announcement.title) body.title = form.title.trim()
        if (form.content !== announcement.content) body.content = form.content.trim()
        if (form.type !== announcement.type) body.type = form.type
        if (form.priority !== announcement.priority) body.priority = form.priority
        await patch(`/api/v1/admin/announcements/${announcement.id}`, body)
        setMessage('公告已更新')
      } else {
        await post('/api/v1/admin/announcements', {
          title: form.title.trim(),
          content: form.content.trim(),
          type: form.type,
          priority: form.priority,
        })
        setMessage('公告已发布')
      }
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEdit ? '编辑公告' : '发布公告'}</h2>
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
              <label className="block text-xs text-slate-500 mb-1">标题 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="公告标题"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">内容 <span className="text-red-500">*</span></label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="公告内容（支持 Markdown）"
                rows={6}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">类型</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  disabled={isEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="system_announcement">全站公告</option>
                  <option value="maintenance">维护通知</option>
                  <option value="update">更新日志</option>
                </select>
              </div>
              <div className="w-28">
                <label className="block text-xs text-slate-500 mb-1">优先级</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg">
              取消
            </button>
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? (isEdit ? '更新中...' : '发布中...') : (isEdit ? '保存' : '发布')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}