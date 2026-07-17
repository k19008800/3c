// ============================================================
//  AnnounceList — 公告列表（表格 / 加载 / 空 / 错误 / 分页）
// ============================================================

import { useCallback, memo } from 'react'
import {
  Loader2, AlertCircle, Pencil, Trash2,
  Megaphone, Eye, EyeOff,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import EmptyState from '@/components/ui/EmptyState'
import type { Announcement } from './types'

interface AnnounceListProps {
  announcements: Announcement[]
  loading: boolean
  error: string
  page: number
  pageSize: number
  total: number
  totalPages: number
  onToggleStatus: (item: Announcement) => void
  onEdit: (item: Announcement) => void
  onDelete: (id: number) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const priorityStyle = (p: number) =>
  p >= 5
    ? 'bg-red-100 text-red-700'
    : p >= 2
    ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-700'

export default function AnnounceList({
  announcements,
  loading,
  error,
  page,
  pageSize,
  total,
  totalPages,
  onToggleStatus,
  onEdit,
  onDelete,
  onPageChange,
  onPageSizeChange,
}: AnnounceListProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 text-sm border-b border-red-100">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

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
              <LoadingRow />
            ) : announcements.length === 0 ? (
              <EmptyState icon="📢" title="暂无公告" description="点击右上角「发布公告」创建一个" />
            ) : (
              announcements.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  onToggleStatus={onToggleStatus}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <PaginationBar
          page={page}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}

/* ── Loading Row ── */

function LoadingRow() {
  return (
    <tr>
      <td colSpan={8} className="text-center py-12">
        <Loader2 className="animate-spin inline-block" size={24} />
      </td>
    </tr>
  )
}

/* ── Data Row ── */

const Row = memo(function Row({
  item,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  item: Announcement
  onToggleStatus: (item: Announcement) => void
  onEdit: (item: Announcement) => void
  onDelete: (id: number) => void
}) {
  const handleToggle = useCallback(() => onToggleStatus(item), [item, onToggleStatus])
  const handleEdit = useCallback(() => onEdit(item), [item, onEdit])
  const handleDelete = useCallback(() => onDelete(item.id), [item.id, onDelete])

  return (
    <tr className="hover:bg-slate-50 transition">
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
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${priorityStyle(item.priority)}`}>
          {item.priority}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleToggle}
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
            onClick={handleEdit}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
          >
            <Pencil size={14} />
            编辑
          </button>
          <button
            onClick={handleDelete}
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
