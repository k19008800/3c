// ============================================================
//  Announcements — 公告管理（入口）
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { get, del } from '@/lib/api'
import type { PaginatedData } from '@/types'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Plus } from 'lucide-react'
import type { Announcement } from './announcements/types'
import AnnounceStats from './announcements/AnnounceStats'
import AnnounceList from './announcements/AnnounceList'
import AnnounceEditor from './announcements/AnnounceEditor'

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-announcements',
    defaults: { keyword: '', page: 1, pageSize: 20 },
  })
  const { keyword, page, pageSize } = filters as { keyword: string; page: number; pageSize: number }
  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, unknown> = { page, pageSize }
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

  useEffect(() => { fetchData() }, [fetchData])

  const handleToggleStatus = useCallback(async (item: Announcement) => {
    try {
      const { patch } = await import('@/lib/api')
      await patch(`/api/v1/admin/announcements/${item.id}`, { status: !item.status })
      fetchData()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }, [fetchData])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    try {
      await del(`/api/v1/admin/announcements/${deleteId}`)
      setDeleteId(null)
      fetchData()
    } catch (err: any) {
      setError(err.message || '删除失败')
    }
  }, [deleteId, fetchData])

  const handleEdit = useCallback((item: Announcement) => {
    setEditing(item)
    setShowModal(true)
  }, [])

  const handleCreate = useCallback(() => {
    setEditing(null)
    setShowModal(true)
  }, [])

  const handleModalClose = useCallback(() => {
    setShowModal(false)
    setEditing(null)
  }, [])

  const handleModalSuccess = useCallback(() => {
    setShowModal(false)
    setEditing(null)
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">公告管理</h1>
        <FeatureDescription page="admin/announcements" className="ml-2" />
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          发布公告
        </button>
      </div>

      <AnnounceStats announcements={announcements} loading={loading && announcements.length === 0} />

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

      <AnnounceList
        announcements={announcements}
        loading={loading}
        error={error}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onToggleStatus={handleToggleStatus}
        onEdit={handleEdit}
        onDelete={setDeleteId}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
      />

      {showModal && (
        <AnnounceEditor
          announcement={editing}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {deleteId !== null && (
        <DeleteConfirmDialog
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

/* ── Delete Confirmation ── */

function DeleteConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">确认删除</h3>
        <p className="text-sm text-slate-600 mb-6">确定要删除该公告吗？此操作不可撤销。</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
