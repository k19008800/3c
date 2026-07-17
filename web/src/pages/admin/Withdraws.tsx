import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { WithdrawRecord, PaginatedData } from '@/types'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Download, CheckCircle2, AlertCircle, CheckSquare } from 'lucide-react'
import FilterBar from '@/components/ui/FilterBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import WithdrawStatsCards from './withdraws/WithdrawStatsCards'
import WithdrawList from './withdraws/WithdrawList'
import WithdrawReview from './withdraws/WithdrawReview'

export default function AdminWithdraws() {
  const [rows, setRows] = useState<WithdrawRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-withdraws',
    defaults: { status: '', page: 1, pageSize: 20 },
  })
  const { status: statusFilter, page, pageSize } = filters as {
    status: string; page: number; pageSize: number
  }
  const totalPages = Math.ceil(total / pageSize)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchMode, setBatchMode] = useState(false)

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewKind, setReviewKind] = useState<'first-review' | 'second-review' | 'mark-paid' | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)

  useEffect(() => { setSelectedIds(new Set()) }, [page, statusFilter])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const res = await get<PaginatedData<WithdrawRecord>>('/api/v1/admin/withdraws', params)
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取提现列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))
  }, [rows])

  const openReview = useCallback((id: number, kind: 'first-review' | 'second-review' | 'mark-paid') => {
    setReviewId(id)
    setReviewKind(kind)
    setReviewOpen(true)
  }, [])

  const handleReview = useCallback(async (data: {
    action: 'approve' | 'reject'
    rejectReason?: string
    bankVoucherUrl?: string
  }) => {
    if (!reviewKind || !reviewId) return
    const id = reviewId
    try {
      if (reviewKind === 'first-review')
        await post(`/api/v1/admin/withdraws/${id}/first-review`, data)
      else if (reviewKind === 'second-review')
        await post(`/api/v1/admin/withdraws/${id}/second-review`, data)
      else
        await post(`/api/v1/admin/withdraws/${id}/mark-paid`, data)
      setMsg(`提现 #${id} ${reviewKind === 'first-review' ? (data.action === 'approve' ? '初审通过' : '已拒绝') : reviewKind === 'second-review' ? (data.action === 'approve' ? '复审通过' : '复审拒绝') : '已标记为打款'}`)
      setReviewOpen(false)
      setReviewKind(null)
      setReviewId(null)
      fetchData()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }, [reviewKind, reviewId, fetchData])

  const doExport = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/v1/admin/withdraws/export?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `withdraws${statusFilter ? `_${statusFilter}` : '_all'}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg(`已导出 ${rows.length} 条提现记录`)
    } catch (err: any) {
      setError(err.message || '导出失败')
    }
  }, [statusFilter, rows])

  const doBatchReview = useCallback(async (action: 'approve' | 'reject') => {
    const ids = Array.from(selectedIds)
    if (!ids.length) { setError('请先选择要审核的提现订单'); return }
    let rejectReason: string | undefined
    if (action === 'reject') {
      rejectReason = prompt('请输入拒绝原因：') || undefined
      if (!rejectReason) return
    }
    try {
      const res = await post('/api/v1/admin/withdraws/batch-review', { ids, action, rejectReason })
      const d = res.data
      setMsg(`批量${action === 'approve' ? '通过' : '拒绝'}：成功 ${action === 'approve' ? d.approved : d.rejected} 笔${d.errors?.length ? `，${d.errors.length} 笔失败` : ''}`)
      setSelectedIds(new Set())
      fetchData()
    } catch (err: any) {
      setError(err.message || '批量操作失败')
    }
  }, [selectedIds, fetchData])

  const toggleBatchMode = useCallback(() => {
    setBatchMode(v => !v)
    setSelectedIds(new Set())
  }, [])

  const handleFilterChange = useCallback((key: any, value: any) => {
    setFilter(key, value)
  }, [setFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">提现管理</h1>
        <FeatureDescription page="admin/withdraws" className="ml-2" />
        <div className="flex items-center gap-2">
          <button onClick={toggleBatchMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${batchMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            <CheckSquare size={16} /> {batchMode ? '退出批量' : '批量审核'}
          </button>
          <button onClick={doExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
            <Download size={16} /> 导出 CSV
          </button>
        </div>
      </div>

      {msg && <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm"><CheckCircle2 size={16} /> {msg}</div>}
      {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm"><AlertCircle size={16} /> {error}</div>}

      <WithdrawStatsCards rows={rows} loading={loading} />

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <FilterBar
            filters={{ status: statusFilter }}
            setFilter={handleFilterChange}
            resetFilters={resetFilters}
            hasActiveFilters={hasActiveFilters}
            fields={[{ key: 'status', label: '状态', type: 'select', options: [
              { value: '', label: '全部' },
              { value: 'pending_first_review', label: '待初审' },
              { value: 'pending_second_review', label: '待复审' },
              { value: 'approved', label: '已通过' },
              { value: 'paid', label: '已打款' },
              { value: 'rejected', label: '已拒绝' },
            ]}]}
          />
          {batchMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-slate-500">已选 {selectedIds.size} 笔</span>
              <button onClick={() => doBatchReview('approve')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">批量通过</button>
              <button onClick={() => doBatchReview('reject')} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition">批量拒绝</button>
            </div>
          )}
        </div>
      </div>

      <WithdrawList
        rows={rows} total={total} loading={loading}
        page={page} pageSize={pageSize} totalPages={totalPages}
        batchMode={batchMode} selectedIds={selectedIds}
        onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
        onAction={openReview}
      />

      <WithdrawReview
        open={reviewOpen} kind={reviewKind} recordId={reviewId}
        onClose={() => { setReviewOpen(false); setReviewKind(null); setReviewId(null) }}
        onSubmit={handleReview}
      />
    </div>
  )
}
