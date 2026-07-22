import { useState, useCallback, useEffect } from 'react'
import { get, patch, post } from '@/lib/api'
import type { PaginatedData } from '@/types'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Flag,
  Ban,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
} from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/Modal'

interface PromptAuditItem {
  id: number
  callLogId: number | null
  userId: number | null
  apiKeyId: number | null
  modelName: string | null
  promptHash: string
  promptPreview: string
  responseStatus: string
  isSensitive: boolean
  sensitiveWords: string[] | null
  auditStatus: string
  auditedBy: number | null
  auditedAt: string | null
  flagReason: string | null
  createdAt: string
  userEmail: string | null
  keyName: string | null
}

interface PromptAuditDetail extends PromptAuditItem {
  prompt: string
  responseSummary: string | null
  callLogCreatedAt: string | null
}

interface AuditStats {
  total: number
  pending: number
  reviewed: number
  flagged: number
  ignored: number
  sensitive: number
}

export default function PromptAudit() {
  const [logs, setLogs] = useState<PromptAuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [selectedLog, setSelectedLog] = useState<PromptAuditDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [auditModalOpen, setAuditModalOpen] = useState(false)
  const [auditAction, setAuditAction] = useState<'reviewed' | 'flagged' | 'ignored'>('reviewed')
  const [flagReason, setFlagReason] = useState('')
  const [auditSubmitting, setAuditSubmitting] = useState(false)

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'prompt-audit',
    defaults: {
      userId: '',
      apiKeyId: '',
      modelName: '',
      auditStatus: '',
      isSensitive: '',
      startDate: '',
      endDate: '',
      keyword: '',
      page: 1,
      pageSize: 20,
    },
  })

  const {
    userId,
    apiKeyId,
    modelName,
    auditStatus,
    isSensitive,
    startDate,
    endDate,
    keyword,
    page,
    pageSize,
  } = filters as Record<string, any>

  const totalPages = Math.ceil(total / pageSize)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (userId) params.userId = userId
      if (apiKeyId) params.apiKeyId = apiKeyId
      if (modelName) params.modelName = modelName
      if (auditStatus) params.auditStatus = auditStatus
      if (isSensitive) params.isSensitive = isSensitive
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (keyword) params.keyword = keyword

      const data = await get<PaginatedData<PromptAuditItem>>('/api/v1/admin/prompt-audit', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, userId, apiKeyId, modelName, auditStatus, isSensitive, startDate, endDate, keyword])

  const fetchStats = useCallback(async () => {
    try {
      const data = await get<AuditStats>('/api/v1/admin/prompt-audit/stats')
      setStats(data)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [fetchLogs, fetchStats])

  const fetchDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const data = await get<PromptAuditDetail>(`/api/v1/admin/prompt-audit/${id}`)
      setSelectedLog(data)
    } catch (err: any) {
      setError(err.message || '获取详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleAudit = async () => {
    if (!selectedLog) return
    setAuditSubmitting(true)
    try {
      await patch(`/api/v1/admin/prompt-audit/${selectedLog.id}/audit`, {
        auditStatus: auditAction,
        flagReason: auditAction === 'flagged' ? flagReason : undefined,
      })
      setAuditModalOpen(false)
      setSelectedLog(null)
      fetchLogs()
      fetchStats()
    } catch (err: any) {
      setError(err.message || '审核失败')
    } finally {
      setAuditSubmitting(false)
    }
  }

  const exportCSV = () => {
    if (logs.length === 0) return
    const headers = [
      'ID',
      '用户',
      'API Key',
      '模型',
      '响应状态',
      '是否敏感',
      '敏感词',
      '审核状态',
      '标记原因',
      '创建时间',
    ]
    const rows = logs.map(l => [
      l.id,
      l.userEmail || '',
      l.keyName || '',
      l.modelName || '',
      l.responseStatus,
      l.isSensitive ? '是' : '否',
      (l.sensitiveWords || []).join('; '),
      l.auditStatus,
      l.flagReason || '',
      l.createdAt,
    ])
    const bom = '\uFEFF'
    const csv =
      bom +
      headers.join(',') +
      '\n' +
      rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `prompt_audit_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { color: string; icon: React.ReactNode }> = {
      pending: { color: 'bg-slate-100 text-slate-700', icon: <Clock size={12} /> },
      reviewed: { color: 'bg-green-100 text-green-700', icon: <CheckCircle size={12} /> },
      flagged: { color: 'bg-red-100 text-red-700', icon: <Flag size={12} /> },
      ignored: { color: 'bg-gray-100 text-gray-500', icon: <Ban size={12} /> },
    }
    const s = map[status] || map.pending
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${s.color}`}>
        {s.icon}
        {status === 'pending' ? '待审核' : status === 'reviewed' ? '已审核' : status === 'flagged' ? '已标记' : '已忽略'}
      </span>
    )
  }

  const responseStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: 'bg-green-100 text-green-700',
      error: 'bg-red-100 text-red-700',
      filtered: 'bg-amber-100 text-amber-700',
      timeout: 'bg-slate-100 text-slate-700',
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${map[status] || 'bg-slate-100 text-slate-700'}`}>
        {status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">提示词审计</h1>
          <p className="text-sm text-slate-500 mt-1">终端用户提示词事后审计，敏感词检测与合规追溯</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={14} /> 导出 CSV
          </button>
          <button
            onClick={() => {
              setFilter('page', 1)
              fetchLogs()
              fetchStats()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-xs text-slate-500 mt-1">总记录</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-600">{stats.pending}</div>
            <div className="text-xs text-slate-500 mt-1">待审核</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-green-600">{stats.reviewed}</div>
            <div className="text-xs text-slate-500 mt-1">已审核</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-red-600">{stats.flagged}</div>
            <div className="text-xs text-slate-500 mt-1">已标记</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-gray-500">{stats.ignored}</div>
            <div className="text-xs text-slate-500 mt-1">已忽略</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-amber-600">{stats.sensitive}</div>
            <div className="text-xs text-slate-500 mt-1">含敏感词</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">用户 ID</label>
            <input
              type="text"
              value={userId}
              onChange={e => setFilter('userId', e.target.value)}
              placeholder="输入用户 ID"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">API Key ID</label>
            <input
              type="text"
              value={apiKeyId}
              onChange={e => setFilter('apiKeyId', e.target.value)}
              placeholder="输入 API Key ID"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">模型名称</label>
            <input
              type="text"
              value={modelName}
              onChange={e => setFilter('modelName', e.target.value)}
              placeholder="输入模型名称"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">审核状态</label>
            <select
              value={auditStatus}
              onChange={e => setFilter('auditStatus', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending">待审核</option>
              <option value="reviewed">已审核</option>
              <option value="flagged">已标记</option>
              <option value="ignored">已忽略</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">是否敏感</label>
            <select
              value={isSensitive}
              onChange={e => setFilter('isSensitive', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setFilter('startDate', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setFilter('endDate', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">搜索提示词</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={e => setFilter('keyword', e.target.value)}
                placeholder="搜索提示词内容"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          {hasActiveFilters && (
            <button onClick={resetFilters} className="text-sm text-slate-500 hover:text-slate-700">
              重置筛选
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">用户</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">API Key</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">模型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">提示词预览</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">响应状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">敏感词</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">审核状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">创建时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                  加载中...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{log.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.userEmail || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.keyName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.modelName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                    {log.promptPreview}
                  </td>
                  <td className="px-4 py-3">{responseStatusBadge(log.responseStatus)}</td>
                  <td className="px-4 py-3">
                    {log.isSensitive ? (
                      <div className="flex flex-wrap gap-1">
                        {(log.sensitiveWords || []).slice(0, 3).map((w, i) => (
                          <Badge key={i} variant="destructive" className="text-xs">
                            {w}
                          </Badge>
                        ))}
                        {(log.sensitiveWords || []).length > 3 && (
                          <span className="text-xs text-slate-400">
                            +{(log.sensitiveWords || []).length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{statusBadge(log.auditStatus)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => fetchDetail(log.id)}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={p => setFilter('page', p)}
        onPageSizeChange={s => setFilters({ pageSize: s })}
      />

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="提示词详情"
        size="lg"
      >
        {detailLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">加载中...</div>
        ) : selectedLog ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">用户</label>
                <div className="text-sm text-slate-900">{selectedLog.userEmail || '-'}</div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">API Key</label>
                <div className="text-sm text-slate-900">{selectedLog.keyName || '-'}</div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">模型</label>
                <div className="text-sm text-slate-900">{selectedLog.modelName || '-'}</div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">响应状态</label>
                <div>{responseStatusBadge(selectedLog.responseStatus)}</div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">审核状态</label>
                <div>{statusBadge(selectedLog.auditStatus)}</div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">创建时间</label>
                <div className="text-sm text-slate-900">
                  {new Date(selectedLog.createdAt).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">原始提示词</label>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap max-h-60 overflow-auto">
                {selectedLog.prompt}
              </pre>
            </div>

            {selectedLog.responseSummary && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">响应摘要</label>
                <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap max-h-40 overflow-auto">
                  {selectedLog.responseSummary}
                </pre>
              </div>
            )}

            {selectedLog.isSensitive && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">命中的敏感词</label>
                <div className="flex flex-wrap gap-2">
                  {(selectedLog.sensitiveWords || []).map((w, i) => (
                    <Badge key={i} variant="destructive">
                      {w}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedLog.flagReason && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">标记原因</label>
                <div className="text-sm text-slate-900">{selectedLog.flagReason}</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setAuditAction('reviewed')
                  setAuditModalOpen(true)
                }}
                className="px-4 py-2 text-sm text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition"
              >
                标记正常
              </button>
              <button
                onClick={() => {
                  setAuditAction('flagged')
                  setAuditModalOpen(true)
                }}
                className="px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition"
              >
                标记异常
              </button>
              <button
                onClick={() => {
                  setAuditAction('ignored')
                  setAuditModalOpen(true)
                }}
                className="px-4 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
              >
                忽略
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Audit Confirm Modal */}
      <Modal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        title={auditAction === 'reviewed' ? '标记为正常' : auditAction === 'flagged' ? '标记为异常' : '忽略'}
        size="sm"
      >
        <div className="space-y-4">
          {auditAction === 'flagged' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">标记原因</label>
              <textarea
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                placeholder="请输入标记为异常的原因"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-24"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setAuditModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleAudit}
              disabled={auditSubmitting || (auditAction === 'flagged' && !flagReason.trim())}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {auditSubmitting ? '提交中...' : '确认'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
