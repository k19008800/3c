import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { RechargeOrder, PaginatedData } from '@/types'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Download, CheckCircle2, AlertCircle } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import OrderStatsCards from './recharge/OrderStatsCards'
import OrderFilterBar from './recharge/OrderFilterBar'
import OrderList from './recharge/OrderList'
import ReviewDialog from './recharge/ReviewDialog'
import type { ReviewMode } from './recharge/ReviewDialog'
import BatchReviewDialog from './recharge/BatchReviewDialog'

export default function AdminRechargeOrders() {
  // ── Data state ──
  const [orders, setOrders] = useState<RechargeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  // ── Persisted filters ──
  const { filters, setFilter, setFilters, resetFilters, hasActiveFilters } = usePersistedFilters({
    storageKey: 'admin-recharge-orders',
    defaults: { status: '', channel: '', page: 1, pageSize: 20 },
  })
  const { status: statusFilter, channel: channelFilter, page, pageSize } = filters as {
    status: string
    channel: string
    page: number
    pageSize: number
  }

  const totalPages = Math.ceil(total / pageSize)

  // ── Batch review state ──
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchModalOpen, setBatchModalOpen] = useState(false)

  // ── Single review dialog state ──
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ReviewMode>('first-confirm')
  const [modalOrder, setModalOrder] = useState<RechargeOrder | null>(null)

  // Clear selection on page/filter change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, statusFilter, channelFilter])

  // ── Fetch data ──
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    setMsg('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      if (channelFilter) params.channel = channelFilter
      const data = await get<PaginatedData<RechargeOrder>>(
        '/api/v1/admin/recharge-orders',
        params,
      )
      setOrders(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取充值订单失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, channelFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // ── Toggle batch mode ──
  const toggleBatchMode = useCallback(() => {
    setBatchMode((prev) => !prev)
    setSelectedIds(new Set())
  }, [])

  // ── Toggle select ──
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === orders.length) return new Set()
      return new Set(orders.map((r) => r.id))
    })
  }, [orders])

  // ── Filter handlers ──
  const handleFilterChange = useCallback(
    (key: 'status' | 'channel' | 'page', value: any) => {
      setFilter(key as any, value)
    },
    [setFilter],
  )

  // ── Open review dialog ──
  const openReviewDialog = useCallback((mode: ReviewMode, order: RechargeOrder) => {
    setModalMode(mode)
    setModalOrder(order)
    setModalOpen(true)
  }, [])

  // ── Submit single review ──
  const handleModalSubmit = useCallback(
    async (data: {
      action: 'confirm' | 'reject'
      rejectReason?: string
      bankTxId?: string
    }) => {
      if (!modalOrder) return
      const { id } = modalOrder

      try {
        if (modalMode === 'legacy-confirm') {
          await post(`/api/v1/admin/recharge-orders/${id}/confirm`)
          setMsg('订单已确认到账')
        } else if (modalMode === 'first-confirm') {
          await post(`/api/v1/admin/recharge-orders/${id}/first-confirm`, data)
          setMsg(
            data.action === 'confirm' ? '初审通过，等待复审' : '初审已拒绝',
          )
        } else if (modalMode === 'second-confirm') {
          await post(`/api/v1/admin/recharge-orders/${id}/second-confirm`, data)
          setMsg(
            data.action === 'confirm' ? '复审通过，充值已到账' : '复审已拒绝',
          )
        } else if (modalMode === 'cancel') {
          await post(`/api/v1/admin/recharge-orders/${id}/cancel`)
          setMsg('订单已取消')
        }

        setModalOpen(false)
        setModalOrder(null)
        fetchOrders()
      } catch (err: any) {
        setError(err.message || '操作失败')
      }
    },
    [modalOrder, modalMode, fetchOrders],
  )

  // ── Open batch review dialog ──
  const [batchDefaultAction, setBatchDefaultAction] = useState<'confirm' | 'reject'>('confirm')

  const openBatchReview = useCallback((action: 'confirm' | 'reject') => {
    const ids = Array.from(selectedIds)
    if (!ids.length) {
      setError('请先选择要审核的充值订单')
      return
    }
    setBatchDefaultAction(action)
    setBatchModalOpen(true)
  }, [selectedIds])

  // ── Submit batch review ──
  const handleBatchSubmit = useCallback(
    async (data: {
      action: 'confirm' | 'reject'
      rejectReason?: string
      isSecond: boolean
    }) => {
      const ids = Array.from(selectedIds)
      try {
        const res = await post('/api/v1/admin/recharge-orders/batch-confirm', {
          ids,
          action: data.action,
          rejectReason:
            data.action === 'reject' ? data.rejectReason || undefined : undefined,
          isSecond: data.isSecond,
        })
        const d = res.data
        const confirmLabel = data.action === 'confirm' ? '通过' : '拒绝'
        setMsg(
          '批量' +
            confirmLabel +
            '：成功 ' +
            (data.action === 'confirm' ? d.confirmed : d.rejected) +
            ' 笔' +
            (d.errors?.length ? '，' + d.errors.length + ' 笔失败' : ''),
        )
        setBatchModalOpen(false)
        setSelectedIds(new Set())
        setBatchMode(false)
        fetchOrders()
      } catch (err: any) {
        setError(err.message || '批量操作失败')
      }
    },
    [selectedIds, fetchOrders],
  )

  // ── Export CSV ──
  const exportCSV = useCallback(() => {
    if (orders.length === 0) return
    const headers = [
      '订单号',
      '用户ID',
      '用户邮箱',
      '金额',
      '方式',
      '状态',
      '凭证号',
      '创建时间',
    ]
    const rows = orders.map((o) => [
      o.orderNo || '',
      o.userId,
      o.userEmail || '',
      o.amount || '',
      o.channel || '',
      o.status || '',
      o.voucherNo || '',
      o.createdAt,
    ])
    const bom = '\uFEFF'
    const csv =
      bom +
      headers.join(',') +
      '\n' +
      rows
        .map((r) =>
          r
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        )
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `recharge_orders_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [orders])

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">充值订单管理</h1>
        <div className="flex items-center gap-2">
          <FeatureDescription page="admin/recharge-orders" className="ml-2" />
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={15} /> 导出 CSV
          </button>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <OrderStatsCards orders={orders} total={total} loading={loading} />

      {/* ── Messages ── */}
      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Filter bar ── */}
      <OrderFilterBar
        status={statusFilter}
        channel={channelFilter}
        onFilterChange={handleFilterChange}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
        batchMode={batchMode}
        onToggleBatchMode={toggleBatchMode}
        selectedCount={selectedIds.size}
      />

      {/* ── Batch action buttons ── */}
      {batchMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openBatchReview('confirm')}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            批量通过
          </button>
          <button
            onClick={() => openBatchReview('reject')}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
          >
            批量拒绝
          </button>
        </div>
      )}

      {/* ── Order list ── */}
      <OrderList
        orders={orders}
        total={total}
        loading={loading}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        batchMode={batchMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onPageChange={(p) => setFilter('page', p)}
        onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
        onOpenReview={openReviewDialog}
      />

      {/* ── Single review dialog ── */}
      <ReviewDialog
        open={modalOpen}
        mode={modalMode}
        order={modalOrder}
        onClose={() => {
          setModalOpen(false)
          setModalOrder(null)
        }}
        onSubmit={handleModalSubmit}
      />

      {/* ── Batch review dialog ── */}
      <BatchReviewDialog
        open={batchModalOpen}
        selectedCount={selectedIds.size}
        defaultAction={batchDefaultAction}
        onSubmit={handleBatchSubmit}
        onClose={() => setBatchModalOpen(false)}
      />
    </div>
  )
}
