import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Send, Clock, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { get, post } from '@/lib/api'

interface WebhookLog {
  id: number
  webhookId: number
  event: string
  status: 'pending' | 'success' | 'failed'
  statusCode: number | null
  requestBody: Record<string, any> | null
  responseBody: string | null
  attempt: number
  maxRetries: number
  errorMessage: string | null
  createdAt: string
  retriedAt: string | null
}

interface WebhookItem {
  id: number
  name: string
  url: string
  enabled: boolean
}

export default function AdminWebhookLogs() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<number | null>(null)
  const [selectedWebhook, setSelectedWebhook] = useState<string>('')
  const [stats, setStats] = useState<any>(null)
  const pageSize = 20

  const loadWebhooks = useCallback(async () => {
    try {
      const res = await get<{ list: WebhookItem[] }>('/api/v1/admin/webhooks')
      setWebhooks(res.list || [])
    } catch (err) {
      console.error('加载 Webhook 列表失败', err)
    }
  }, [])

  const loadLogs = useCallback(async (whId: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      const res = await get<{ list: WebhookLog[]; total: number; totalPages: number }>(
        `/api/v1/admin/webhooks/${whId}/logs?${params}`
      )
      setLogs(res.list || [])
      setTotal(res.total)
      setPage(p)
    } catch (err) {
      console.error('加载 Webhook 日志失败', err)
    }
    setLoading(false)
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await get<any>('/api/v1/admin/webhooks/stats')
      setStats(res)
    } catch (err) {
      console.error('加载 Webhook 统计失败', err)
    }
  }, [])

  useEffect(() => {
    loadWebhooks()
    loadStats()
  }, [])

  useEffect(() => {
    if (selectedWebhook) {
      loadLogs(selectedWebhook, 1)
    }
  }, [selectedWebhook])

  const handleRetry = async (logId: number) => {
    if (!selectedWebhook) return
    setRetrying(logId)
    try {
      await post(`/api/v1/admin/webhooks/${selectedWebhook}/logs/${logId}/retry`)
      loadLogs(selectedWebhook, page)
    } catch (err) {
      console.error('重试失败', err)
    }
    setRetrying(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs">
          <Clock className="w-3 h-3" />待发送
        </span>
      case 'success':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
          <CheckCircle className="w-3 h-3" />成功
        </span>
      case 'failed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-900/50 text-red-400 rounded text-xs">
          <XCircle className="w-3 h-3" />失败
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
      second: '2-digit',
    })
  }

  if (!selectedWebhook) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            Webhook 事件日志 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">查看 Webhook 投递日志、手动重试失败推送</p>
        </div>

        {/* 统计概览 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">近 24 小时投递</div>
              <div className="text-2xl font-bold text-gray-100">{stats.recent24hCount}</div>
            </div>
            {stats.statusCounts?.map((s: any) => (
              <div key={s.status} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-gray-400 text-sm mb-1 capitalize">{s.status === 'success' ? '成功' : s.status === 'failed' ? '失败' : '待处理'}</div>
                <div className={`text-2xl font-bold ${
                  s.status === 'success' ? 'text-green-400' : s.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                }`}>{s.count}</div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center py-12 text-gray-500">
          <Send className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg mb-2">请选择一个 Webhook 查看事件日志</p>
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {webhooks.map(wh => (
              <button
                key={wh.id}
                onClick={() => setSelectedWebhook(String(wh.id))}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-200 text-sm transition-colors"
              >
                {wh.name}
                <span className={`ml-2 inline-block w-2 h-2 rounded-full ${wh.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
              </button>
            ))}
          </div>
          {webhooks.length === 0 && <p className="text-sm mt-4 text-gray-600">暂无 Webhook 配置</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 + 返回 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            Webhook 事件日志 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            当前查看：{webhooks.find(w => String(w.id) === selectedWebhook)?.name || `Webhook #${selectedWebhook}`}
          </p>
        </div>
        <button
          onClick={() => setSelectedWebhook('')}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
        >
          切换 Webhook
        </button>
      </div>

      {/* 日志列表 */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无投递日志</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {getStatusBadge(log.status)}
                  <span className="text-sm font-medium text-gray-200">{log.event}</span>
                  {log.statusCode && (
                    <span className="text-xs text-gray-500">HTTP {log.statusCode}</span>
                  )}
                  <span className="text-xs text-gray-500">
                    第 {log.attempt}/{log.maxRetries} 次
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{formatDate(log.createdAt)}</span>
                  {log.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(log.id)}
                      disabled={retrying === log.id}
                      className="flex items-center gap-1 px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded text-xs transition-colors disabled:opacity-50"
                    >
                      {retrying === log.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      重试
                    </button>
                  )}
                </div>
              </div>
              {log.errorMessage && (
                <div className="mt-2 px-3 py-2 bg-red-900/20 rounded text-xs text-red-400">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  {log.errorMessage}
                </div>
              )}
              {log.retriedAt && (
                <div className="mt-1 text-xs text-gray-500">
                  重试时间: {formatDate(log.retriedAt)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>共 {total} 条</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => loadLogs(selectedWebhook, page - 1)}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              上一页
            </button>
            <button
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => loadLogs(selectedWebhook, page + 1)}
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