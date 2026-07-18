import { useState, useCallback, useMemo } from 'react'
import { del } from '@/lib/api'
import type { AdminModel } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import FilterBar from '@/components/ui/FilterBar'
import { TableSkeleton } from '@/components/ui/skeleton'
import { AlertCircle, Pencil, Trash2, Loader2, Download } from 'lucide-react'
import { TYPE_OPTIONS, STATUS_OPTIONS, TYPE_MAP } from './types'

interface Props {
  models: AdminModel[]
  loading: boolean
  error: string
  total: number
  page: number
  pageSize: number
  totalPages: number
  keyword: string
  typeFilter: string
  statusFilter: string
  setFilter: (key: string, value: unknown) => void
  resetFilters: () => void
  hasActiveFilters: boolean
  onSearch: () => void
  onEdit: (model: AdminModel) => void
  onRefresh: () => void
}

export default function ModelList({
  models,
  loading,
  error,
  total,
  page,
  pageSize,
  totalPages,
  keyword,
  typeFilter,
  statusFilter,
  setFilter,
  resetFilters,
  hasActiveFilters,
  onSearch,
  onEdit,
  onRefresh,
}: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = useCallback(
    async (id: number) => {
      setDeleting(true)
      try {
        await del(`/api/v1/admin/models/${id}`)
        setDeletingId(null)
        onRefresh()
      } catch (err: any) {
        console.error(err)
      } finally {
        setDeleting(false)
      }
    },
    [onRefresh]
  )

  const handleExportCsv = useCallback(() => {
    if (models.length === 0) return
    const headers = ['ID', '模型名称', '显示名称', '简介', '类型', '状态', '创建时间']
    const rows = models.map((m) => [
      m.id,
      m.name,
      m.displayName || '',
      m.description || '',
      m.type,
      m.status ? '启用' : '停用',
      m.createdAt,
    ])
    const bom = '\uFEFF'
    const csv =
      bom +
      headers.join(',') +
      '\n' +
      rows
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `admin_models_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [models])

  const filterFields = useMemo(
    () => [
      {
        key: 'keyword',
        label: '搜索',
        type: 'text' as const,
        placeholder: '搜索模型名称',
      },
      {
        key: 'type',
        label: '类型',
        type: 'select' as const,
        options: TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label })),
      },
      {
        key: 'status',
        label: '状态',
        type: 'select' as const,
        options: STATUS_OPTIONS,
      },
    ],
    []
  )

  return (
    <>
      {/* Filters */}
      <FilterBar
        filters={{ keyword, type: typeFilter, status: statusFilter }}
        setFilter={(key, value) => setFilter(key as string, value)}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onSearch={onSearch}
        fields={filterFields}
        extra={
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={15} />
            导出 CSV
          </button>
        }
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
                <th className="px-4 py-3 text-sm font-medium text-slate-500">模型名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">显示名称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">简介</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <TableSkeleton rows={5} cols={8} />
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
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
                      <td
                        className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate"
                        title={m.description || ''}
                      >
                        {m.description || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            typeInfo?.color || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {typeInfo?.label || m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            m.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {m.status ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit(m)}
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
          <PaginationBar
            page={page}
            onPageChange={(p) => setFilter('page', p)}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setFilter('pageSize', s)
              setFilter('page', 1)
            }}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>

      {/* Delete Confirmation */}
      {deletingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">确认删除</h3>
            <p className="text-sm text-slate-600 mb-6">确定要删除该模型吗？此操作不可撤销。</p>
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
    </>
  )
}
