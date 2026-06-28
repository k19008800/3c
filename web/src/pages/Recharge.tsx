import { useState, useEffect, useCallback } from 'react'
import { get, post } from '@/lib/api'
import { useImpersonate } from '@/hooks/use-impersonate'
import type { RechargeOrder, PaginatedData } from '@/types'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Banknote,
  QrCode,
  History,
} from 'lucide-react'

type Tab = 'online' | 'bank' | 'history'

export default function Recharge() {
  const [tab, setTab] = useState<Tab>('online')
  const { isImpersonating, targetEmail } = useImpersonate()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">充值</h1>

      {/* 模拟态提示 */}
      {isImpersonating && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
          <p className="text-amber-800 font-medium">⛔ 模拟模式下不支持充值操作</p>
          <p className="text-amber-600 text-xs mt-1">
            当前以 <strong>{targetEmail}</strong> 的身份操作，请先退出模拟模式再进行充值
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('online')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${
            tab === 'online' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <QrCode size={16} />
          在线支付
        </button>
        <button
          onClick={() => setTab('bank')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${
            tab === 'bank' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Banknote size={16} />
          银行转账
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${
            tab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={16} />
          充值记录
        </button>
      </div>

      {tab === 'online' && <OnlinePayment />}
      {tab === 'bank' && <BankTransfer />}
      {tab === 'history' && <OrderHistory />}
    </div>
  )
}

function OnlinePayment() {
  const [amount, setAmount] = useState('')
  const [channel, setChannel] = useState('wechat_scan')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const presets = [10, 50, 100, 200, 500]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResult(null)
    const amt = amount.trim()
    if (!amt || parseFloat(amt) <= 0) {
      setError('请输入有效的金额')
      return
    }
    setLoading(true)
    try {
      const data = await post('/api/v1/recharge', { amount: amt, channel })
      setResult(data)
    } catch (err: any) {
      setError(err.message || '发起充值失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
      <h2 className="text-lg font-semibold">在线支付</h2>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">充值金额 (¥)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="请输入充值金额"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />
        </div>

        {/* Quick amount presets */}
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p.toString())}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:border-blue-400 hover:text-blue-600 transition"
            >
              ¥{p}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">支付方式</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setChannel('wechat_scan')}
              className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm transition ${
                channel === 'wechat_scan'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400'
              }`}
            >
              微信支付
            </button>
            <button
              type="button"
              onClick={() => setChannel('alipay_scan')}
              className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm transition ${
                channel === 'alipay_scan'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400'
              }`}
            >
              支付宝
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
        >
          {loading && <Loader2 className="animate-spin" size={18} />}
          确认充值
        </button>
      </form>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 size={18} />
            充值订单已创建
          </div>
          <div className="text-sm text-slate-600 space-y-1">
            <p>订单号：{result.orderNo}</p>
            <p>金额：¥{result.amount}</p>
          </div>
          {result.payUrl && (
            <a
              href={result.payUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
            >
              前往支付
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function BankTransfer() {
  const [form, setForm] = useState({
    amount: '',
    bankName: '',
    accountNumber: '',
    transferDate: '',
    remark: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [savedPayer, setSavedPayer] = useState<{ bankName: string | null; accountNumber: string | null } | null>(null)

  // 获取上次成功对公转账的付款账户信息
  useEffect(() => {
    get<{ bankName?: string; accountNumber?: string }>('/api/v1/recharge/bank-transfer/saved-info')
      .then(data => {
        if (data && (data.bankName || data.accountNumber)) {
          setSavedPayer(data as any)
          if (data.bankName) setForm(f => ({ ...f, bankName: data.bankName! }))
          if (data.accountNumber) setForm(f => ({ ...f, accountNumber: data.accountNumber! }))
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    const amt = form.amount.trim()
    if (!amt || parseFloat(amt) <= 0) {
      setError('请输入有效的金额')
      return
    }
    if (!form.bankName || !form.accountNumber || !form.transferDate) {
      setError('请填写完整的银行转账信息')
      return
    }
    setLoading(true)
    try {
      await post('/api/v1/recharge/bank-transfer', {
        amount: amt,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        transferDate: form.transferDate,
        remark: form.remark || undefined,
      })
      setSuccess(true)
      // 保留上次银行信息，只清金额、日期和备注
      setForm(f => ({ ...f, amount: '', transferDate: '', remark: '' }))
    } catch (err: any) {
      setError(err.message || '提交银行转账信息失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
      <h2 className="text-lg font-semibold">银行转账</h2>
      {savedPayer && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">
          <History size={12} /> 上次使用
        </span>
      )}
      <p className="text-sm text-slate-500">提交银行转账信息后，请等待管理员审核确认。</p>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          银行转账信息已提交，等待管理员审核确认。
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">充值金额 (¥)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="请输入金额"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">银行名称</label>
            <input
              type="text"
              value={form.bankName}
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              placeholder="如：中国工商银行"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">转账账号</label>
            <input
              type="text"
              value={form.accountNumber}
              onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
              placeholder="请输入转账账号"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">转账日期</label>
            <input
              type="date"
              value={form.transferDate}
              onChange={(e) => setForm((f) => ({ ...f, transferDate: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">备注（可选）</label>
          <input
            type="text"
            value={form.remark}
            onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
            placeholder="转账备注"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
        >
          {loading && <Loader2 className="animate-spin" size={18} />}
          提交审核
        </button>
      </form>
    </div>
  )
}

function OrderHistory() {
  const [orders, setOrders] = useState<RechargeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const totalPages = Math.ceil(total / pageSize)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const data = await get<PaginatedData<RechargeOrder>>('/api/v1/recharge/orders', params)
      setOrders(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取充值记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
        <AlertCircle size={16} />
        {error}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">充值记录</h2>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="pending">待支付</option>
          <option value="paid">已支付</option>
          <option value="confirmed">已确认</option>
          <option value="failed">失败</option>
          <option value="expired">已过期</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-3 text-sm font-medium text-slate-500">订单号</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">支付方式</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
              <th className="px-4 py-3 text-sm font-medium text-slate-500">备注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  暂无充值记录
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-600 font-mono">{order.orderNo}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">¥{Number(order.amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{order.channel === 'wechat_scan' ? '微信支付' : order.channel === 'alipay_scan' ? '支付宝' : order.channel === 'bank_transfer' ? '银行转账' : order.channel}</td>
                  <td className="px-4 py-3">{getStatusBadge(order.status)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                    {new Date(order.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{order.remark || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <span className="text-sm text-slate-500">
            第 {page} / {totalPages} 页
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
  )
}
