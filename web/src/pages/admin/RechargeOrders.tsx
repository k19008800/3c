import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { RechargeOrder, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle,
  Ban, ShieldCheck, Shield,
} from 'lucide-react'

// ── 审核弹窗 ──
type ReviewMode = 'first-confirm' | 'second-confirm' | 'legacy-confirm' | 'cancel'

function ReviewModal({
  open,
  mode,
  order,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: ReviewMode
  order: RechargeOrder | null
  onClose: () => void
  onSubmit: (data: { action: 'confirm' | 'reject'; rejectReason?: string; bankTxId?: string }) => Promise<void>
}) {
  const [action, setAction] = useState<'confirm' | 'reject'>('confirm')
  const [rejectReason, setRejectReason] = useState('')
  const [bankTxId, setBankTxId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // reset on open
  useEffect(() => {
    if (open) {
      setAction('confirm')
      setRejectReason('')
      setBankTxId('')
      setSubmitting(false)
    }
  }, [open])

  if (!open || !order) return null

  const titleMap: Record<ReviewMode, string> = {
    'first-confirm': '对公转账 - 初审',
    'second-confirm': '对公转账 - 复审',
    'legacy-confirm': '确认到账',
    cancel: '取消订单',
  }

  const isSecond = mode === 'second-confirm'
  const isCancel = mode === 'cancel'
  const isLegacy = mode === 'legacy-confirm'

  const handleSubmit = async () => {
    if (isCancel) {
      setSubmitting(true)
      try {
        await onSubmit({ action: 'reject' } as any)
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (action === 'reject' && !rejectReason.trim()) {
      return
    }
    if (isSecond && action === 'confirm' && !bankTxId.trim()) {
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        action,
        ...(action === 'reject' ? { rejectReason: rejectReason.trim() } : {}),
        ...(isSecond && action === 'confirm' ? { bankTxId: bankTxId.trim() } : {}),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900">{titleMap[mode]}</h3>

        {/* 订单信息 */}
        <div className="text-sm text-slate-600 space-y-1.5 bg-slate-50 p-3 rounded-lg">
          <p>订单号：<span className="font-mono">{order.orderNo}</span></p>
          <p className="text-base font-semibold text-slate-900">金额：¥{Number(order.amount || 0).toFixed(2)}</p>
          <p>用户：{order.userEmail || order.userNickname || `ID:${order.userId}`}</p>
          {order.channel === 'bank_transfer' && (
            <>
              <div className="border-t border-slate-200 my-1.5" />
              <p className="font-medium text-slate-800">银行转账信息</p>
              <p>银行：{order.bankName || <span className="text-slate-400">未提供</span>}</p>
              <p>账号：<span className="font-mono">{order.accountNumber || '未提供'}</span></p>
              <p>转账日期：{order.transferDate || '未提供'}</p>
              {order.remark && <p className="mt-1 text-xs text-slate-500">备注：{order.remark}</p>}
              {order.voucherImage && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500 mb-1">转账凭证：</p>
                  <img
                    src={order.voucherImage}
                    alt="转账凭证"
                    className="max-h-40 rounded border border-slate-200 object-contain cursor-pointer hover:opacity-90 transition"
                    onClick={() => window.open(order.voucherImage!, '_blank')}
                  />
                </div>
              )}
            </>
          )}
          {order.voucherNo && <p>凭证号：<span className="font-mono">{order.voucherNo}</span></p>}
          {(order.firstConfirmedBy && isSecond) && (
            <p className="text-blue-600 font-medium mt-1">✅ 已初审，待复审</p>
          )}
        </div>

        {/* 取消订单 */}
        {isCancel && (
          <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
            确定要取消此订单吗？取消后不可恢复。
          </div>
        )}

        {/* 操作选择（非取消/非 legacy） */}
        {!isCancel && !isLegacy && (
          <div className="flex gap-3">
            <button
              onClick={() => setAction('confirm')}
              className={`flex-1 py-2 rounded-lg border text-sm transition ${
                action === 'confirm'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              ✅ {isSecond ? '复审通过' : '审核通过'}
            </button>
            <button
              onClick={() => setAction('reject')}
              className={`flex-1 py-2 rounded-lg border text-sm transition ${
                action === 'reject'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              ❌ 拒绝
            </button>
          </div>
        )}

        {/* 拒绝原因 */}
        {action === 'reject' && !isLegacy && !isCancel && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">拒绝原因</label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}

        {/* 复审: 银行交易流水号 */}
        {isSecond && action === 'confirm' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">银行交易流水号</label>
            <input
              type="text"
              value={bankTxId}
              onChange={(e) => setBankTxId(e.target.value)}
              placeholder="请输入银行流水号"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* 按钮组 */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 py-2 rounded-lg text-sm text-white transition flex items-center justify-center gap-1 ${
              action === 'reject' || isCancel
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {submitting && <Loader2 className="animate-spin" size={14} />}
            {isCancel ? '确认取消' : action === 'reject' ? '确认拒绝' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ──

export default function AdminRechargeOrders() {
  const [orders, setOrders] = useState<RechargeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')

  // 审核弹窗状态
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ReviewMode>('first-confirm')
  const [modalOrder, setModalOrder] = useState<RechargeOrder | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    setMsg('')
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      if (channelFilter) params.channel = channelFilter
      const data = await get<PaginatedData<RechargeOrder>>('/api/v1/admin/recharge-orders', params)
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

  // ── 打开审核弹窗 ──
  const openModal = (mode: ReviewMode, order: RechargeOrder) => {
    setModalMode(mode)
    setModalOrder(order)
    setModalOpen(true)
  }

  // ── 弹窗提交 ──
  const handleModalSubmit = async (data: { action: 'confirm' | 'reject'; rejectReason?: string; bankTxId?: string }) => {
    if (!modalOrder) return
    const { id } = modalOrder

    try {
      if (modalMode === 'legacy-confirm') {
        await post(`/api/v1/admin/recharge-orders/${id}/confirm`)
        setMsg('订单已确认到账')
      } else if (modalMode === 'first-confirm') {
        await post(`/api/v1/admin/recharge-orders/${id}/first-confirm`, data)
        setMsg(data.action === 'confirm' ? '初审通过，等待复审' : '初审已拒绝')
      } else if (modalMode === 'second-confirm') {
        await post(`/api/v1/admin/recharge-orders/${id}/second-confirm`, data)
        setMsg(data.action === 'confirm' ? '复审通过，充值已到账' : '复审已拒绝')
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
  }

  // ── 获取操作按钮 ──
  const getActions = (order: RechargeOrder) => {
    const btns: { label: string; mode: ReviewMode; className: string }[] = []

    const isBankTransfer = order.channel === 'bank_transfer'
    const isPending = order.status === 'pending'
    const isPaid = order.status === 'paid'

    if (isBankTransfer && isPending) {
      if (!order.firstConfirmedBy) {
        // 未初审
        btns.push({ label: '初审', mode: 'first-confirm', className: 'text-blue-600 hover:text-blue-800' })
      } else if (!order.secondConfirmedBy) {
        // 已初审待复审
        btns.push({ label: '复审', mode: 'second-confirm', className: 'text-green-600 hover:text-green-800' })
      }
    }

    if (isPaid) {
      btns.push({ label: '确认到账', mode: 'legacy-confirm', className: 'text-green-600 hover:text-green-800' })
    }

    if (isPending && !order.firstConfirmedBy) {
      // 仅未进入初审流程的订单可取消
      btns.push({ label: '取消', mode: 'cancel', className: 'text-red-500 hover:text-red-700' })
    }

    return btns
  }

  // ── 状态标签 ──
  const getStatusBadge = (order: RechargeOrder) => {
    const { status, channel, firstConfirmedBy, secondConfirmedBy } = order

    // 对公转账: pending + 已初审 → 特殊标签
    if (channel === 'bank_transfer' && status === 'pending') {
      if (firstConfirmedBy && !secondConfirmedBy) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
            <ShieldCheck size={12} /> 待复审
          </span>
        )
      }
      if (!firstConfirmedBy) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Shield size={12} /> 待初审
          </span>
        )
      }
    }

    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      paid: 'bg-blue-100 text-blue-700',
      confirmed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      expired: 'bg-slate-100 text-slate-500',
      cancelled: 'bg-slate-100 text-slate-500',
    }
    const labels: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      confirmed: '已确认',
      failed: '失败',
      expired: '已过期',
      cancelled: '已取消',
    }

    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-700'}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">充值订单管理</h1>
      <FeatureDescription page="admin/recharge-orders" className="ml-2" />

      {/* 消息提示 */}
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

      {/* 筛选 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="confirmed">已确认</option>
              <option value="failed">失败</option>
              <option value="expired">已过期</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">支付方式</label>
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="wechat_scan">微信支付</option>
              <option value="alipay_scan">支付宝</option>
              <option value="bank_transfer">银行转账</option>
            </select>
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">订单号</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">方式</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">审核进度</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">凭证号</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    暂无充值订单
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono max-w-[160px] truncate" title={order.orderNo}>
                      {order.orderNo}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <div className="truncate max-w-[120px]" title={order.userNickname || order.userEmail || ''}>
                        {order.userNickname || order.userEmail || `ID:${order.userId}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">¥{Number(order.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {order.channel === 'bank_transfer' ? (
                        <span title={`${order.bankName ?? ''} ${order.accountNumber ?? ''}`}>
                          银行转账
                          {(order.bankName || order.accountNumber) && (
                            <span className="block text-xs text-slate-400 font-mono truncate max-w-[140px]">
                              {order.bankName} {order.accountNumber?.slice(-4) ? `(${order.accountNumber.slice(-4)})` : ''}
                            </span>
                          )}
                        </span>
                      ) : order.channel === 'wechat_scan' ? '微信支付' :
                        order.channel === 'alipay_scan' ? '支付宝' : order.channel}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(order)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {order.channel === 'bank_transfer' && order.status === 'confirmed' ? (
                        <span className="text-green-600">
                          初审 ✔ 复审 ✔
                        </span>
                      ) : order.channel === 'bank_transfer' && order.firstConfirmedBy ? (
                        <span className="text-sky-600">
                          初审 ✔ 待复审
                        </span>
                      ) : order.channel === 'bank_transfer' && order.status === 'pending' ? (
                        <span className="text-yellow-600">
                          待初审
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                      {order.voucherNo || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getActions(order).map((btn) => (
                          <button
                            key={btn.mode}
                            onClick={() => openModal(btn.mode, order)}
                            className={`text-sm font-medium ${btn.className}`}
                          >
                            {btn.mode === 'first-confirm' && <Shield size={14} className="inline mr-0.5" />}
                            {btn.mode === 'second-confirm' && <ShieldCheck size={14} className="inline mr-0.5" />}
                            {btn.mode === 'cancel' && <Ban size={14} className="inline mr-0.5" />}
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
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

      {/* 审核弹窗 */}
      <ReviewModal
        open={modalOpen}
        mode={modalMode}
        order={modalOrder}
        onClose={() => { setModalOpen(false); setModalOrder(null) }}
        onSubmit={handleModalSubmit}
      />
    </div>
  )
}
