import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, Megaphone, AlertTriangle, Info, RotateCcw,
  CalendarDays, User,
} from 'lucide-react'

interface Announcement {
  id: number
  title: string
  content: string
  type: string
  priority: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

const typeLabels: Record<string, { label: string; icon: any; color: string }> = {
  system_announcement: { label: '全站公告', icon: Megaphone, color: 'text-indigo-600 bg-indigo-50' },
  maintenance: { label: '维护通知', icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
  update: { label: '更新日志', icon: RotateCcw, color: 'text-blue-600 bg-blue-50' },
}

function getTypeConfig(type: string) {
  return typeLabels[type] || { label: type, icon: Info, color: 'text-slate-600 bg-slate-50' }
}

export default function Announcements() {
  const [list, setList] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<PaginatedData<Announcement>>('/api/v1/announcements', { page, pageSize })
      setList(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取公告失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Megaphone size={28} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">全站公告</h1>
        {!loading && total > 0 && (
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            共 {total} 条
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" size={32} />
        </div>
      )}

      {/* Empty state */}
      {!loading && list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Megaphone size={48} className="mb-3 opacity-50" />
          <p className="text-sm">暂无公告</p>
        </div>
      )}

      {/* Announcement list */}
      {!loading && list.length > 0 && (
        <div className="space-y-3">
          {list.map((item) => {
            const tc = getTypeConfig(item.type)
            const TypeIcon = tc.icon
            const isExpanded = expandedId === item.id

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Header row — clickable to toggle detail */}
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="w-full flex items-start gap-4 p-4 text-left hover:bg-slate-50 transition"
                >
                  {/* Type icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tc.color}`}>
                    <TypeIcon size={18} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tc.color}`}>
                        {tc.label}
                      </span>
                      {item.priority >= 5 && (
                        <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                          置顶
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} />
                        {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                      {item.createdBy && (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {item.createdBy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <div className="shrink-0 text-slate-300 mt-1">
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pl-[4.5rem] border-t border-slate-100">
                    <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap mt-3">
                      {item.content}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <PaginationBar
          page={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
