// ============================================================
//  AnnounceReadStats — 公告阅读统计组件
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import {
  Loader2, Users, Eye, EyeOff, TrendingUp,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'

interface ReadStats {
  announcementId: number
  title: string
  totalUsers: number
  readUsers: number
  unreadUsers: number
  readRate: number
}

interface Reader {
  id: number
  email: string
  nickname: string | null
  isRead: boolean
  readAt: string | null
}

interface AnnounceReadStatsProps {
  announcementId: number
  onClose?: () => void
}

export default function AnnounceReadStats({ announcementId, onClose }: AnnounceReadStatsProps) {
  const [stats, setStats] = useState<ReadStats | null>(null)
  const [readers, setReaders] = useState<Reader[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [readStatus, setReadStatus] = useState<'all' | 'read' | 'unread'>('all')
  const [expanded, setExpanded] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  // 获取阅读统计
  const fetchStats = useCallback(async () => {
    try {
      const data = await get<ReadStats>(`/api/v1/admin/announcements/${announcementId}/stats`)
      setStats(data)
    } catch (err: any) {
      setError(err.message || '获取统计失败')
    }
  }, [announcementId])

  // 获取阅读用户列表
  const fetchReaders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, unknown> = { page, pageSize }
      if (readStatus !== 'all') {
        params.readStatus = readStatus
      }
      const data = await get<{ list: Reader[]; total: number }>(
        `/api/v1/admin/announcements/${announcementId}/readers`,
        params
      )
      setReaders(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [announcementId, page, pageSize, readStatus])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (expanded) {
      fetchReaders()
    }
  }, [expanded, fetchReaders])

  // 切换筛选条件时重置页码
  const handleReadStatusChange = (status: 'all' | 'read' | 'unread') => {
    setReadStatus(status)
    setPage(1)
  }

  if (error && !stats) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <Loader2 className="animate-spin inline-block" size={20} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 统计概览 */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Eye size={16} className="text-indigo-500" />
            阅读统计
          </h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            {expanded ? (
              <>
                收起详情
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                查看详情
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {/* 总用户数 */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <Users size={14} />
              <span className="text-xs">总用户</span>
            </div>
            <div className="text-xl font-bold text-slate-900">{stats.totalUsers}</div>
          </div>

          {/* 已读用户 */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
              <Eye size={14} />
              <span className="text-xs">已读</span>
            </div>
            <div className="text-xl font-bold text-green-600">{stats.readUsers}</div>
          </div>

          {/* 未读用户 */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
              <EyeOff size={14} />
              <span className="text-xs">未读</span>
            </div>
            <div className="text-xl font-bold text-amber-600">{stats.unreadUsers}</div>
          </div>

          {/* 阅读率 */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-indigo-600 mb-1">
              <TrendingUp size={14} />
              <span className="text-xs">阅读率</span>
            </div>
            <div className="text-xl font-bold text-indigo-600">{stats.readRate}%</div>
          </div>
        </div>

        {/* 阅读率进度条 */}
        <div className="mt-3">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
              style={{ width: `${stats.readRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* 用户列表（展开时显示） */}
      {expanded && (
        <div className="p-4">
          {/* 筛选按钮 */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => handleReadStatusChange('all')}
              className={`px-3 py-1 text-xs rounded-full transition ${
                readStatus === 'all'
                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              全部 ({stats.totalUsers})
            </button>
            <button
              onClick={() => handleReadStatusChange('read')}
              className={`px-3 py-1 text-xs rounded-full transition ${
                readStatus === 'read'
                  ? 'bg-green-100 text-green-700 font-medium'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              已读 ({stats.readUsers})
            </button>
            <button
              onClick={() => handleReadStatusChange('unread')}
              className={`px-3 py-1 text-xs rounded-full transition ${
                readStatus === 'unread'
                  ? 'bg-amber-100 text-amber-700 font-medium'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              未读 ({stats.unreadUsers})
            </button>
          </div>

          {/* 用户表格 */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-4">{error}</div>
          ) : readers.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              暂无{readStatus === 'read' ? '已读' : readStatus === 'unread' ? '未读' : ''}用户
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">用户ID</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">邮箱</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">昵称</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">状态</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">阅读时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {readers.map((reader) => (
                      <tr key={reader.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-600">{reader.id}</td>
                        <td className="px-3 py-2 text-xs text-slate-900">{reader.email}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {reader.nickname || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {reader.isRead ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                              <Eye size={10} />
                              已读
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                              <EyeOff size={10} />
                              未读
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {reader.readAt
                            ? new Date(reader.readAt).toLocaleString('zh-CN', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="mt-3">
                  <PaginationBar
                    page={page}
                    onPageChange={setPage}
                    pageSize={pageSize}
                    onPageSizeChange={setPageSize}
                    total={total}
                    totalPages={totalPages}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
