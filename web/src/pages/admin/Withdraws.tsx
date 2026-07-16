import { useEffect, useState, useCallback, useRef } from 'react'
import { get, post } from '@/lib/api'
import type { WithdrawRecord, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import FeatureDescription from '@/components/admin/FeatureDescription'
import PaginationBar from '@/components/ui/PaginationBar'
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, CheckSquare } from 'lucide-react'

const REJECT_REASONS = [
  '银行信息有误，请核对后重新提交',
  '风控拦截，请联系客服处理',
  '提现金额超限，请调整金额',
  '身份信息不符，请重新提交',
  '银行卡号格式错误',
  '开户行名称不完整',
]

export default function AdminWithdraws() {
  const [rows, setRows] = useState<WithdrawRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const { filters, loaded: prefsLoaded, updateFilter } = usePagePreferences('admin_withdraws')

  // 恢复筛选条件
  useEffect(() => {
    if (prefsLoaded && filters.status) {
      setStatusFilter(filters.status)
    }
  }, [prefsLoaded])

  const totalPages = Math.ceil(total / pageSize)

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

  // 翻页时清空选择
  useEffect(() => { setSelectedIds(new Set()) }, [page, statusFilter])

  const handleStatusFilterChange = (v: string) => {
    setStatusFilter(v)
    updateFilter('status', v || '')
    setPage(1)
  }

  // ── 勾选逻辑 ──

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)))
    }
  }

  // ── 导出 CSV ──

  const doExport = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const url = `/api/v1/admin/withdraws/export?${params.toString()}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const filename = statusFilter
        ? `withdraws_${statusFilter}_${new Date().toISOString().slice(0, 10)}.csv`
        : `withdraws_all_${new Date().toISOString().slice(0, 10)}.csv`
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg(`已导出 ${rows.length} 条提现记录`)
    } catch (err: any) {
      setError(err.message || '导出失败')
    }
  }

  // ── 批量审核 ──

  const doBatchReview = async (action: 'approve' | 'reject') => {
    const ids = Array.from(selectedIds)
    if (!ids.length) {
      setError('请先选择要审核的提现订单')
      return
    }

    let reason: string | undefined
    if (action === 'reject') {
      const options = REJECT_REASONS.map((r, i) => `${i + 1}. ${r}`).join('\n')
      const input = prompt(
        `请选择拒绝原因（输入编号或手动输入）：\n${options}`,
        REJECT_REASONS[0]
      )
      if (!input) return
      const num = parseInt(input, 10)
      reason = num >= 1 && num <= REJECT_REASONS.length ? REJECT_REASONS[num - 1] : input.trim()
    }

    try {
      const res = await post('/api/v1/admin/withdraws/batch-review', { ids, action, rejectReason: reason })
      const data = res.data
      setMsg(
        `批量${action === 'approve' ? '通过' : '拒绝'}：成功 ${action === 'approve' ? data.approved : data.rejected} 笔` +
        (data.errors?.length ? `，${data.errors.length} 笔失败` : '')
      )
      setSelectedIds(new Set())
      fetchData()
    } catch (err: any) {
      setError(err.message || '批量操作失败')
    }
  }

  // ── 拒绝原因提示框 ──

  const promptRejectReason = (): string | null => {
    const options = REJECT_REASONS.map((r, i) => `${i + 1}. ${r}`).join('\n')
    const input = prompt(
      `请选择拒绝原因（输入编号或手动输入）：\n${options}`,
      REJECT_REASONS[0]
    )
    if (!input) return null
    const num = parseInt(input, 10)
    if (num >= 1 && num <= REJECT_REASONS.length) {
      return REJECT_REASONS[num - 1]
    }
    return input.trim()
  }

  // ── 单个操作 ──

  const doFirstReview = async (id: number, action: 'approve' | 'reject') => {
    let reason: string | undefined
    if (action === 'reject') {
      reason = promptRejectReason() ?? undefined
      if (!reason) return
    }
    try {
      await post(`/api/v1/admin/withdraws/${id}/first-review`, { action, rejectReason: reason })
      setMsg(`提现 #${id} ${action === 'approve' ? '初审通过' : '已拒绝'}`)
      fetchData()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const doSecondReview = async (id: number, action: 'approve' | 'reject') => {
    let reason: string | undefined
    if (action === 'reject') {
      reason = promptRejectReason() ?? undefined
      if (!reason) return
    }
    const voucher = action === 'approve' ? (prompt('请输入打款凭证 URL（可选）：') || undefined) : undefined
    try {
      await post(`/api/v1/admin/withdraws/${id}/second-review`, { action, rejectReason: reason, bankVoucherUrl: voucher })
      setMsg(`提现 #${id} ${action === 'approve' ? '复审通过' : '复审拒绝'}`)
      fetchData()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const doMarkPaid = async (id: number) => {
    const voucher = prompt('请输入打款凭证 URL（可选）：') || undefined
    try {
      await post(`/api/v1/admin/withdraws/${id}/mark-paid`, { bankVoucherUrl: voucher })
      setMsg(`提现 #${id} 已标记为打款`)
      fetchData()
    } catch (err: any) {
      setError(err.message || '操作失败')
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending_first_review: 'bg-yellow-100 text-yellow-700',
      pending_second_review: 'bg-blue-100 text-blue-700',
      approved: 'bg-violet-100 text-violet-700',
      paid: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    }
    const label: Record<string, string> = {
      pending_first_review: '待初审',
      pending_second_review: '待复审',
      approved: '已通过',
      paid: '已打款',
      rejected: '已拒绝',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-slate-100 text-slate-700'}`}>
        {label[s] || s}
      </span>
    )
  }

  // ── 渲染 ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">提现管理</h1>
        <FeatureDescription page="admin/withdraws" className="ml-2" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${
              batchMode
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckSquare size={16} />
            {batchMode ? '退出批量' : '批量审核'}
          </button>
          <button
            onClick={doExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            <Download size={16} />
            导出 CSV
          </button>
        </div>
      </div>

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

      {/* 筛选行 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select value={statusFilter} onChange={(e) => { handleStatusFilterChange(e.target.value) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              <option value="pending_first_review">待初审</option>
              <option value="pending_second_review">待复审</option>
              <option value="approved">已通过</option>
              <option value="paid">已打款</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>

          {/* 批量操作按钮 */}
          {batchMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-slate-500">已选 {selectedIds.size} 笔</span>
              <button
                onClick={() => doBatchReview('approve')}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                批量通过
              </button>
              <button
                onClick={() => doBatchReview('reject')}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
              >
                批量拒绝
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                {batchMode && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">代理商</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">手续费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">实际到账</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">拒绝原因</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={batchMode ? 10 : 9} className="text-center py-12"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={batchMode ? 10 : 9} className="text-center py-12 text-slate-400">暂无提现订单</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50 transition ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}>
                    {batchMode && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{r.nickname || r.email || `#${r.userId}`}</td>
                    <td className="px-4 py-3 text-sm font-medium">¥{Number(r.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">¥{Number(r.feeAmount || '0').toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">¥{Number(r.actualAmount || r.amount).toFixed(2)}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{r.rejectReason || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {r.status === 'pending_first_review' && (
                          <>
                            <button onClick={() => doFirstReview(r.id, 'approve')} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">初审通过</button>
                            <button onClick={() => doFirstReview(r.id, 'reject')} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition">拒绝</button>
                          </>
                        )}
                        {r.status === 'pending_second_review' && (
                          <>
                            <button onClick={() => doSecondReview(r.id, 'approve')} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition">复审通过</button>
                            <button onClick={() => doSecondReview(r.id, 'reject')} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition">拒绝</button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button onClick={() => doMarkPaid(r.id)} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition">标记已打款</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
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
    </div>
  )
}
