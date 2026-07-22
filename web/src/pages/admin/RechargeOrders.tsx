import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { RechargeOrder, PaginatedData } from '@/types'
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

export default function AdminRechargeOrders() {
  const [orders, setOrders] = useState<RechargeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [msg, setMsg] = useState('')

  const totalPages = Math.ceil(total / pageSize)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
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

  const handleConfirm = async (id: number) => {
    if (!window.confirm('确认此订单已到账?')) return
    try {
      await post(`/api/v1/admin/recharge-orders/${id}/confirm`)
      setMsg('订单已确认')
      fetchOrders()
    } catch (err: any) {
      setError(err.message || '确认失败')
    }
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      paid: 'bg-blue-100 text-blue-700',
      confirmed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      expired: 'bg-slate-100 text-slate-500',
    }
    const labels: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      confirmed: '已确认',
      failed: '失败',
      expired: '已过期',
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="confirmed">已确认</option>
              <option value="failed">失败</option>
              <option value="expired">已过期</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">支付方式</label>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">订单号</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">支付方式</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">备注</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    暂无充值订单
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{order.orderNo}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{order.userId}</td>
                    <td className="px-4 py-3 text-sm font-medium">¥{Number(order.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {order.channel === 'wechat_scan' ? '微信支付' :
                       order.channel === 'alipay_scan' ? '支付宝' :
                       order.channel === 'bank_transfer' ? '银行转账' : order.channel}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(order.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{order.remark || '-'}</td>
                    <td className="px-4 py-3">
                      {order.status === 'paid' && (
                        <button
                          onClick={() => handleConfirm(order.id)}
                          className="text-sm text-green-600 hover:text-green-800"
                        >
                          确认到账
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
