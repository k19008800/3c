// ──── 实名审核 ────
// 入口组件，编排统计卡片、列表、详情弹窗
import { useEffect, useState, useCallback, useRef } from 'react'
import { get, post } from '@/lib/api'
import type { RealNameReviewRecord, PaginatedData } from '@/types'
import { CheckCircle2, AlertCircle, CheckSquare } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import FilterBar from '@/components/ui/FilterBar'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import ReviewStatsCards from './real-name/ReviewStatsCards'
import ReviewList from './real-name/ReviewList'
import ReviewDetail from './real-name/ReviewDetail'
import { STATUS_TABS } from './real-name/types'
import type { ReviewStats } from './real-name/types'

export default function AdminRealNameReview() {
  const [records, setRecords] = useState<RealNameReviewRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [stats, setStats] = useState<ReviewStats>({ pending: 0, approved: 0, rejected: 0 })
  const [selected, setSelected] = useState<RealNameReviewRecord | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const [batchRejectReason, setBatchRejectReason] = useState('')
  const [batchReviewing, setBatchReviewing] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-real-name-review',
    defaults: { keyword: '', activeTab: 'pending_review', page: 1, pageSize: 20 },
  })
  const { keyword, activeTab, page, pageSize } = filters as {
    keyword: string; activeTab: string; page: number; pageSize: number
  }
  const totalPages = Math.ceil(total / pageSize)

  // 翻页或切tab时清空选择
  useEffect(() => { setSelectedIds(new Set()) }, [page, activeTab])

  // 批量选择
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === records.length && records.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map(r => r.id)))
    }
  }, [selectedIds, records])

  // 获取列表
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize, status: activeTab }
      if (keyword) params.keyword = keyword
      const data = await get<PaginatedData<RealNameReviewRecord>>('/api/v1/admin/real-name-reviews', params)
      setRecords(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取失败')
    } finally { setLoading(false) }
  }, [page, pageSize, activeTab, keyword])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // 获取统计（各状态计数）
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const statuses = ['pending_review', 'approved', 'rejected']
      const results = await Promise.all(
        statuses.map(s =>
          get<PaginatedData<RealNameReviewRecord>>('/api/v1/admin/real-name-reviews', { page: 1, pageSize: 1, status: s })
            .catch(() => ({ total: 0 } as any))
        )
      )
      setStats({
        pending: results[0].total ?? 0,
        approved: results[1].total ?? 0,
        rejected: results[2].total ?? 0,
      })
    } catch {
      // stats fetch 失败不影响主功能
    } finally { setStatsLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  // 单个审核操作
  const handleReview = useCallback(async (action: 'approve' | 'reject') => {
    if (!selected) return
    try {
      await post(`/api/v1/admin/real-name-review/${selected.userId}`, {
        action,
        rejectReason: action === 'reject' ? rejectReason : undefined,
      })
      setMsg(action === 'approve' ? '已通过' : '已拒绝')
      setShowDetail(false)
      setSelected(null)
      setRejectReason('')
      fetchRecords()
      fetchStats()
    } catch (err: any) { setError(err.message || '操作失败') }
  }, [selected, rejectReason, fetchRecords, fetchStats])

  // 批量审核
  const doBatchReview = useCallback(async (action: 'approve' | 'reject') => {
    const ids = Array.from(selectedIds)
    if (!ids.length) { setError('请先选择要审核的记录'); return }
    if (action === 'reject' && !batchRejectReason.trim()) { setError('请填写拒绝原因'); return }
    setBatchReviewing(true)
    setError('')
    try {
      await post('/api/v1/admin/real-name-reviews/batch-review', {
        ids, action,
        rejectReason: action === 'reject' ? batchRejectReason : undefined,
      })
      setMsg(`批量${action === 'approve' ? '通过' : '拒绝'}：成功处理 ${ids.length} 条`)
      setSelectedIds(new Set())
      setBatchRejectReason('')
      fetchRecords()
      fetchStats()
    } catch (err: any) { setError(err.message || '批量操作失败') }
    finally { setBatchReviewing(false) }
  }, [selectedIds, batchRejectReason, fetchRecords, fetchStats])

  const handleViewDetail = useCallback((r: RealNameReviewRecord) => {
    setSelected(r)
    setShowDetail(true)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">实名审核</h1>
          <FeatureDescription page="admin/real-name-review" className="ml-2" />
        </div>
        {activeTab === 'pending_review' && (
          <button
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); setBatchRejectReason('') }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${
              batchMode
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckSquare size={16} />
            {batchMode ? '退出批量' : '批量审核'}
          </button>
        )}
      </div>

      {/* Messages */}
      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stats Cards */}
      <ReviewStatsCards stats={stats} loading={statsLoading} />

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setFilter('activeTab', t.key) }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeTab === t.key
                ? 'bg-white shadow-sm text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <FilterBar
          filters={{ keyword }}
          setFilter={(key, value) => setFilter(key as any, value)}
          resetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
          onSearch={fetchRecords}
          fields={[{ key: 'keyword', label: '搜索', type: 'text', placeholder: '搜索邮箱或昵称' }]}
        />
        <span className="text-sm text-slate-400">共 {total} 条</span>
      </div>

      {/* List */}
      <ReviewList
        records={records}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        activeTab={activeTab}
        batchMode={batchMode}
        selectedIds={selectedIds}
        batchRejectReason={batchRejectReason}
        batchReviewing={batchReviewing}
        selectAllRef={selectAllRef}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onViewDetail={handleViewDetail}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
        onBatchApprove={() => doBatchReview('approve')}
        onBatchReject={() => doBatchReview('reject')}
        onBatchRejectReasonChange={setBatchRejectReason}
      />

      {/* Detail Modal */}
      <ReviewDetail
        record={selected}
        open={showDetail}
        activeTab={activeTab}
        rejectReason={rejectReason}
        imgErrors={imgErrors}
        onClose={() => { setShowDetail(false); setSelected(null); setRejectReason('') }}
        onApprove={() => handleReview('approve')}
        onReject={() => {
          if (!rejectReason.trim() && !confirm('确定拒绝此认证？')) return
          handleReview('reject')
        }}
        onRejectReasonChange={setRejectReason}
        onImageError={(key) => setImgErrors(p => ({ ...p, [key]: true }))}
        onPreviewImage={setPreviewImage}
      />

      {/* Image Preview Overlay */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl">&times;</button>
            <img src={previewImage} alt="证件大图" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
