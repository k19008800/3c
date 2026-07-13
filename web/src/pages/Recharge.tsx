import { useState, useEffect, useCallback } from 'react'
import { get, post } from '@/lib/api'
import { useImpersonate } from '@/hooks/use-impersonate'
import type { RechargeOrder, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Banknote,
  QrCode,
  History,
  Calculator,
  Clock,
  FileText,
  UserCheck,
} from 'lucide-react'

type Tab = 'online' | 'bank' | 'history'

// ── 充值（用户端）─-
//
// 【业务说明】
//   用户充值入口，支持两种支付方式：
//   1. 在线支付（微信/支付宝）：选择金额 → 选择渠道 → 创建订单 → 扫码支付 → 自动到账
//   2. 银行转账：填写金额/银行/账号/日期 → 提交凭证 → 等待管理员双审确认
//   充值估算器：输入预期 Token 量 → 计算所需金额。
//   充值记录标签页：查看历史订单，支持按状态筛选（待支付/已支付/已确认/已过期）。
//
// 【状态流转】pending → paid(在线)/confirmed(银行双审通过) | expired | cancelled
// 【审核中指示】银行转账订单 status=pending 时显示"审核中"琥珀色标识
// 【权限要求】登录即可充值；银行转账需管理员审核
// 【数据来源】POST /api/v1/recharge, POST /api/v1/recharge/bank-transfer, GET /api/v1/recharge/orders

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

// ── Price per token estimate (simplified; 3cloud charges by token, not a flat rate) ──
// Use a configurable rate: CNY per 1000 tokens.
const DEFAULT_RATE_PER_1K = 0.001 // 0.001 CNY per 1000 tokens — adjust as needed

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
  const [successSummary, setSuccessSummary] = useState<{
    amount: string
    bankName: string
    accountNumber: string
    transferDate: string
    remark: string
    orderNo?: string
    submittedAt: string
  } | null>(null)
  const [savedPayer, setSavedPayer] = useState<{ bankName: string | null; accountNumber: string | null } | null>(null)

  // ── Recharge estimate ──
  const [estimateTokens, setEstimateTokens] = useState('')
  const [ratePer1k, setRatePer1k] = useState(DEFAULT_RATE_PER_1K.toString())

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
    setSuccessSummary(null)
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
      const result = await post('/api/v1/recharge/bank-transfer', {
        amount: amt,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        transferDate: form.transferDate,
        remark: form.remark || undefined,
      }) as any
      setSuccess(true)
      setSuccessSummary({
        amount: amt,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        transferDate: form.transferDate,
        remark: form.remark,
        orderNo: result?.orderNo,
        submittedAt: new Date().toLocaleString('zh-CN'),
      })
      // 保留上次银行信息，只清金额、日期和备注
      setForm(f => ({ ...f, amount: '', transferDate: '', remark: '' }))
    } catch (err: any) {
      setError(err.message || '提交银行转账信息失败')
    } finally {
      setLoading(false)
    }
  }

  const estimatedAmount = (() => {
    const tokens = parseInt(estimateTokens, 10)
    if (!tokens || tokens <= 0) return null
    const rate = parseFloat(ratePer1k) || DEFAULT_RATE_PER_1K
    return (tokens / 1000) * rate
  })()

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
      <h2 className="text-lg font-semibold">银行转账</h2>
      {savedPayer && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">
          <History size={12} /> 上次使用
        </span>
      )}
      <p className="text-sm text-slate-500">提交银行转账信息后，请等待管理员审核确认。</p>

      {/* ── Recharge Estimate ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-800">
          <Calculator size={16} />
          <h3 className="text-sm font-semibold">充值估算</h3>
        </div>
        <p className="text-xs text-amber-600">输入期望获得的 Token 数量，估算需要充值多少金额</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 whitespace-nowrap">期望 Token 数：</label>
            <input
              type="number"
              min="1"
              value={estimateTokens}
              onChange={(e) => setEstimateTokens(e.target.value)}
              placeholder="如 1000000"
              className="w-36 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 whitespace-nowrap">单价 (¥/千tokens)：</label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={ratePer1k}
              onChange={(e) => setRatePer1k(e.target.value)}
              className="w-28 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
        {estimatedAmount !== null && (
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 bg-amber-100 rounded-lg px-4 py-2">
            <Calculator size={14} />
            预计需要充值约 <span className="text-lg">¥{estimatedAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && successSummary && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-base">
            <CheckCircle2 size={20} />
            转账信息已保存
          </div>
          <p className="text-sm text-green-600">您的银行转账信息已成功提交，请等待管理员审核确认。</p>

          {/* Summary Card */}
          <div className="bg-white border border-green-200 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <FileText size={14} className="text-slate-500" />
              提交摘要
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">提交时间：</span>
                <span className="text-slate-800">{successSummary.submittedAt}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">充值金额：</span>
                <span className="font-semibold text-green-700">¥{Number(successSummary.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">银行名称：</span>
                <span className="text-slate-800">{successSummary.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">转账账号：</span>
                <span className="text-slate-800 font-mono">{successSummary.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">转账日期：</span>
                <span className="text-slate-800">{successSummary.transferDate}</span>
              </div>
              {successSummary.orderNo && (
                <div className="flex justify-between">
                  <span className="text-slate-500">订单号：</span>
                  <span className="text-slate-800 font-mono">{successSummary.orderNo}</span>
                </div>
              )}
            </div>
            {successSummary.remark && (
              <div className="mt-2 pt-2 border-t border-slate-100 text-sm">
                <span className="text-slate-500">备注：</span>
                <span className="text-slate-700">{successSummary.remark}</span>
              </div>
            )}
          </div>

          {/* Pending review status indicator */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <Clock size={16} className="text-amber-600 animate-pulse" />
            <div>
              <span className="text-sm font-medium text-amber-800">审核中</span>
              <span className="text-xs text-amber-600 ml-2">预计 1-2 个工作日内完成审核</span>
            </div>
          </div>
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
  const [pageSize, setPageSize] = useState(20)
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
      reviewing: 'bg-amber-100 text-amber-700',
    }
    const labels: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      confirmed: '已确认',
      failed: '失败',
      expired: '已过期',
      reviewing: '审核中',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-700'}`}>
        {labels[status] || status}
      </span>
    )
  }

  // ── Pending review count ──
  const pendingReviewCount = orders.filter(
    (o) => o.status === 'reviewing' || (o.channel === 'bank_transfer' && o.status === 'pending')
  ).length

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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">充值记录</h2>
          {/* Pending review indicator */}
          {pendingReviewCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              <Clock size={12} className="animate-pulse" />
              {pendingReviewCount} 笔审核中
            </span>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="pending">待支付</option>
          <option value="paid">已支付</option>
          <option value="reviewing">审核中</option>
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
              orders.map((order) => {
                // Bank transfer orders with pending status show as "reviewing"
                const displayStatus = order.channel === 'bank_transfer' && order.status === 'pending'
                  ? 'reviewing'
                  : order.status
                return (
                  <tr key={order.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{order.orderNo}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">¥{Number(order.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{order.channel === 'wechat_scan' ? '微信支付' : order.channel === 'alipay_scan' ? '支付宝' : order.channel === 'bank_transfer' ? '银行转账' : order.channel}</td>
                    <td className="px-4 py-3">{getStatusBadge(displayStatus)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        {order.remark || '-'}
                        {order.channel === 'bank_transfer' && order.status === 'pending' && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600" title="等待管理员审核">
                            <UserCheck size={12} />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
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
  )
}
