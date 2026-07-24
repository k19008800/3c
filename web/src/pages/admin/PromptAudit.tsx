import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { AuditTable, AuditDetail } from './prompt-audit/components'
import { usePromptAudit } from './prompt-audit/hooks'
import type { PromptAuditDetail } from './prompt-audit/types'

export default function PromptAudit() {
  const { logs, total, loading, error, stats, loadLogs, loadDetail, audit } = usePromptAudit()

  const { filters, setFilter } = usePersistedFilters({
    storageKey: 'prompt-audit',
    defaults: {
      page: 1,
      pageSize: 20,
      userId: '',
      apiKeyId: '',
      modelName: '',
      auditStatus: '',
      isSensitive: '',
      startDate: '',
      endDate: '',
    },
  })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PromptAuditDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Load on mount and filter change
  useEffect(() => {
    loadLogs({
      page: filters.page,
      pageSize: filters.pageSize,
      userId: filters.userId || undefined,
      apiKeyId: filters.apiKeyId || undefined,
      modelName: filters.modelName || undefined,
      auditStatus: filters.auditStatus || undefined,
      isSensitive: filters.isSensitive || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    })
  }, [filters, loadLogs])

  const handleView = async (id: number) => {
    setSelectedId(id)
    setDetailLoading(true)
    const d = await loadDetail(id)
    setDetail(d)
    setDetailLoading(false)
  }

  const handleAudit = async (id: number, action: 'reviewed' | 'flagged' | 'ignored') => {
    await audit(id, action)
    if (selectedId === id) {
      const d = await loadDetail(id)
      setDetail(d)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">提示词审计</h1>
        <button
          onClick={() => loadLogs({
            page: filters.page,
            pageSize: filters.pageSize,
          })}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-slate-500">总计</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <div className="text-xs text-slate-500">待审核</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.reviewed}</div>
            <div className="text-xs text-slate-500">已审核</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.flagged}</div>
            <div className="text-xs text-slate-500">已标记</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-slate-600">{stats.ignored}</div>
            <div className="text-xs text-slate-500">已忽略</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.sensitive}</div>
            <div className="text-xs text-slate-500">含敏感词</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <select
            value={filters.auditStatus}
            onChange={(e) => setFilter('auditStatus', e.target.value)}
            className="px-3 py-1.5 border rounded text-sm"
          >
            <option value="">全部状态</option>
            <option value="pending">待审核</option>
            <option value="reviewed">已审核</option>
            <option value="flagged">已标记</option>
            <option value="ignored">已忽略</option>
          </select>
          <select
            value={filters.isSensitive}
            onChange={(e) => setFilter('isSensitive', e.target.value)}
            className="px-3 py-1.5 border rounded text-sm"
          >
            <option value="">全部</option>
            <option value="true">含敏感词</option>
            <option value="false">无敏感词</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="animate-spin" size={24} />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无审计日志</div>
        ) : (
          <AuditTable
            logs={logs}
            onView={handleView}
            onAudit={handleAudit}
          />
        )}

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
            totalPages={Math.ceil(total / filters.pageSize)}
            onPageChange={(p) => setFilter('page', p)}
            onPageSizeChange={(s) => {
              setFilter('pageSize', s)
              setFilter('page', 1)
            }}
          />
        </div>
      </div>

      {/* Detail Modal */}
      {(selectedId || detailLoading) && (
        <AuditDetail
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setSelectedId(null)
            setDetail(null)
          }}
          onAudit={async (action, reason) => {
            if (selectedId) {
              await audit(selectedId, action, reason)
              const d = await loadDetail(selectedId)
              setDetail(d)
            }
          }}
        />
      )}
    </div>
  )
}