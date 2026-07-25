// ============================================================
//  AnnouncementReadStats — 公告阅读统计组件（控制台/前端用户用）
//  展示阅读人数/总用户数、阅读率进度条、"查看阅读用户"弹窗
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Modal from '@/components/ui/Modal'
import PaginationBar from '@/components/ui/PaginationBar'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Eye, Users } from 'lucide-react'

// ── 类型定义 ──

interface ReadStatsSummary {
  announcementId: number
  title: string
  totalUsers: number
  readUsers: number
  unreadUsers: number
  readRate: number
}

interface ReadUser {
  userId: number
  nickname: string | null
  email: string
  readAt: string | null
}

interface AnnouncementReadStatsProps {
  announcementId: number
}

// ── 组件 ──

export default function AnnouncementReadStats({ announcementId }: AnnouncementReadStatsProps) {
  const [stats, setStats] = useState<ReadStatsSummary | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')

  // 弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [readers, setReaders] = useState<ReadUser[]>([])
  const [readersTotal, setReadersTotal] = useState(0)
  const [readersPage, setReadersPage] = useState(1)
  const [readersPageSize, setReadersPageSize] = useState(20)
  const [readersLoading, setReadersLoading] = useState(false)
  const [readersError, setReadersError] = useState('')

  const readersTotalPages = Math.ceil(readersTotal / readersPageSize)

  // 获取阅读统计概览
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError('')
    try {
      const data = await get<ReadStatsSummary>(
        `/api/v1/admin/announcements/${announcementId}/stats`
      )
      setStats(data)
    } catch (err: any) {
      setStatsError(err.message || '获取阅读统计失败')
    } finally {
      setStatsLoading(false)
    }
  }, [announcementId])

  // 获取阅读用户列表（弹窗内用）
  const fetchReaders = useCallback(async () => {
    setReadersLoading(true)
    setReadersError('')
    try {
      // 假设 API 返回 { list: ReadUser[], total: number }
      const data = await get<{ list: ReadUser[]; total: number }>(
        `/api/v1/admin/announcements/${announcementId}/readers`,
        { page: readersPage, pageSize: readersPageSize }
      )
      setReaders(data.list)
      setReadersTotal(data.total)
    } catch (err: any) {
      setReadersError(err.message || '获取阅读用户失败')
    } finally {
      setReadersLoading(false)
    }
  }, [announcementId, readersPage, readersPageSize])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // 打开弹窗时加载用户列表
  useEffect(() => {
    if (dialogOpen) {
      fetchReaders()
    }
  }, [dialogOpen, fetchReaders])

  // 页码/每页条数变化时重新加载
  useEffect(() => {
    if (dialogOpen) {
      fetchReaders()
    }
  }, [readersPage, readersPageSize, dialogOpen, fetchReaders])

  const handleOpenDialog = () => {
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setReadersPage(1)
    setReaders([])
    setReadersTotal(0)
  }

  // ── 加载中 ──
  if (statsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton variant="card" />
        </CardContent>
      </Card>
    )
  }

  // ── 错误提示 ──
  if (statsError || !stats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600">{statsError || '暂无阅读统计数据'}</p>
        </CardContent>
      </Card>
    )
  }

  const { totalUsers, readUsers, readRate } = stats

  return (
    <>
      {/* ── 阅读统计卡片 ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye size={16} className="text-indigo-500" />
            阅读统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 阅读人数 / 总人数 */}
          <div className="flex items-end gap-2 mb-3">
            <span className="text-3xl font-bold text-indigo-600">{readUsers}</span>
            <span className="text-sm text-slate-500 mb-1">
              / {totalUsers} 位用户
            </span>
          </div>

          {/* 阅读率进度条 */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>阅读率</span>
              <span>{readRate}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.min(readRate, 100)}%` }}
              />
            </div>
          </div>

          {/* 查看阅读用户按钮 */}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleOpenDialog}
          >
            <Users size={14} className="mr-1" />
            查看阅读用户
          </Button>
        </CardContent>
      </Card>

      {/* ── 用户列表弹窗 ── */}
      <Modal
        isOpen={dialogOpen}
        onClose={handleCloseDialog}
        title="阅读用户列表"
        size="lg"
      >
        {readersLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin h-6 w-6 text-slate-400" />
          </div>
        ) : readersError ? (
          <div className="py-6 text-center text-sm text-red-600">{readersError}</div>
        ) : readers.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            暂无阅读用户
          </div>
        ) : (
          <>
            {/* 表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      用户 ID
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      昵称
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      邮箱
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      阅读时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {readers.map((user) => (
                    <tr key={user.userId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-700">{user.userId}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {user.nickname || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{user.email}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {user.readAt
                          ? new Date(user.readAt).toLocaleString('zh-CN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
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
            {readersTotalPages > 1 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <PaginationBar
                  page={readersPage}
                  onPageChange={setReadersPage}
                  pageSize={readersPageSize}
                  onPageSizeChange={setReadersPageSize}
                  total={readersTotal}
                  totalPages={readersTotalPages}
                />
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  )
}
