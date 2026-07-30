import { useEffect, useState, useCallback } from 'react'
import { Loader2, Undo2, Clock, CheckCircle, XCircle, Search } from 'lucide-react'
import { get } from '@/lib/api'

interface UndoLog {
  id: number
  token: string
  action: string
  resourceType: string
  resourceId: number
  operatorId: number
  beforeData: Record<string, any>
  status: 'pending' | 'undone' | 'expired'
  undoneAt: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  delete_api_key: '删除 API Key',
  disable_vendor: '禁用供应商',
  disable_vendor_model: '禁用模型',
  disable_user: '禁用用户',
  delete_api_key_permanent: '永久删除 Key',
}

const RESOURCE_LABELS: Record<string, string> = {
  api_key: 'API Key',
  vendor: '供应商',
  vendor_model: '模型',
  user: '用户',
}

export default function AdminUndoLogs() {
  const [logs, setLogs] = useState<UndoLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const pageSize = 20

  const loadLogs = useCallback(async (p: number, status?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      if (status) params.set('status', status)
      const res = await get<{ list: UndoLog[]; total: number; totalPages: number }>(
        `/api/v1/admin/undo/history?${params}`
      )
      setLogs(res.list || [])
      setTotal(res.total)
      setPage(p)
    } catch (err: any) {
      console.error('加载撤销历史失败', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadLogs(1, statusFilter) }, [])

  const handleFilterChange = (status: string) => {
    setStatusFilter(status)
    loadLogs(1, status)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs">
          <Clock className="w-3 h-3" />待撤销
        </span>
      case 'undone':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
          <CheckCircle className="w-3 h-3" />已撤销
        </span>
      case 'expired':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">
          <XCircle className="w-3 h-3" />已过期
        </span>
      default:
        return <span className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">{status}</span>
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">
          撤销操作管理 <span className="text-xs text-gray-500 align-top">[?]</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">查看和追踪已执行操作的撤销记录，撤销令牌在操作后 30 秒内有效</p>
      </div>

      {/* 状态筛选 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">状态筛选：</span>
        {['', 'pending', 'undone', 'expired'].map(s => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {s === '' ? '全部' : s === 'pending' ? '待撤销' : s === 'undone' ? '已撤销' : '已过期'}
          </button>
        ))}
      </div>

      {/* 撤销记录列表 */}
      {logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Undo2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无撤销操作记录</p>
          <p className="text-sm mt-1">执行可撤销操作后，这里将显示撤销记录</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left py-3 px-4">操作类型</th>
                <th className="text-left py-3 px-4">资源类型</th>
                <th className="text-center py-3 px-4">资源 ID</th>
                <th className="text-center py-3 px-4">状态</th>
                <th className="text-center py-3 px-4">操作人</th>
                <th className="text-center py-3 px-4">操作时间</th>
                <th className="text-center py-3 px-4">撤销时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-3 px-4 text-gray-100">{ACTION_LABELS[log.action] || log.action}</td>
                  <td className="py-3 px-4 text-gray-400">{RESOURCE_LABELS[log.resourceType] || log.resourceType}</td>
                  <td className="py-3 px-4 text-center text-gray-300">#{log.resourceId}</td>
                  <td className="py-3 px-4 text-center">{getStatusBadge(log.status)}</td>
                  <td className="py-3 px-4 text-center text-gray-400">#{log.operatorId}</td>
                  <td className="py-3 px-4 text-center text-gray-400">{formatDate(log.createdAt)}</td>
                  <td className="py-3 px-4 text-center text-gray-400">{formatDate(log.undoneAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>共 {total} 条</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => loadLogs(page - 1, statusFilter)}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              上一页
            </button>
            <button
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => loadLogs(page + 1, statusFilter)}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}