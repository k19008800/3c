import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { AgentWithdrawOrder, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import PaginationBar from '@/components/ui/PaginationBar'
import { Loader2, AlertCircle, CheckCircle2, Wallet, History } from 'lucide-react'

export default function AgentWithdraw() {
  const [rows, setRows] = useState<AgentWithdrawOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [amount, setAmount] = useState('')
  const [bankCardNo, setBankCardNo] = useState('')
  const [bankName, setBankName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [savedBankInfo, setSavedBankInfo] = useState<{ bankCardNo: string | null; bankName: string | null } | null>(null)
  const [bankInfoLoaded, setBankInfoLoaded] = useState(false)

  const { filters, loaded: prefsLoaded, updateFilter, saveAll } = usePagePreferences('agent_withdraws')

  // 恢复筛选条件
  useEffect(() => {
    if (prefsLoaded && filters.status) {
      setStatusFilter(filters.status)
    }
  }, [prefsLoaded])

  // 获取上次银行信息
  useEffect(() => {
    get<{ bankCardNo: string | null; bankName: string | null } | null>('/api/v1/agent/bank-info')
      .then(data => {
        if (data) {
          setSavedBankInfo(data)
          if (data.bankCardNo) setBankCardNo(data.bankCardNo)
          if (data.bankName) setBankName(data.bankName)
        }
        setBankInfoLoaded(true)
      })
      .catch(() => setBankInfoLoaded(true))
  }, [])

  const totalPages = Math.ceil(total / pageSize)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const res = await get<PaginatedData<AgentWithdrawOrder>>('/api/v1/agent/withdraws', params)
      setRows(res.list)
      setTotal(res.total)
    } catch (err: any) {
      setError(err.message || '获取提现记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleStatusFilterChange = (v: string) => {
    setStatusFilter(v)
    updateFilter('status', v || '')
    setPage(1)
  }

  const handleWithdraw = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('请输入有效的提现金额'); return }
    if (!bankCardNo.trim()) { setError('请输入银行卡号'); return }
    if (!bankName.trim()) { setError('请输入银行名称'); return }
    if (!window.confirm(`确认提现 ¥${amt.toFixed(2)} 至 ${bankName}(${bankCardNo.slice(-4)})？`)) return
    setSubmitting(true)
    setError('')
    try {
      await post('/api/v1/agent/withdraw', {
        amount: amt.toFixed(2),
        bankCardNo: bankCardNo.trim(),
        bankName: bankName.trim(),
      })
      setMsg('提现申请已提交，等待审核')
      setAmount('')
      // 不清除银行信息 — 已记住
      fetchData()
    } catch (err: any) {
      setError(err.message || '提现失败')
    } finally {
      setSubmitting(false)
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
      paid: '已到账',
      rejected: '已拒绝',
    }
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || 'bg-slate-100 text-slate-700'}`}>
        {label[s] || s}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">提现</h1>

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

      {/* New withdraw form */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={20} className="text-blue-600" />
          <h2 className="text-base font-semibold text-slate-800">发起提现</h2>
          {savedBankInfo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium ml-2">
              <History size={12} /> 上次使用
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">提现金额 (¥)</label>
            <input type="number" step="0.01" min="0" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="请输入金额"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">银行名称</label>
            <div className="relative">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="如：中国建设银行"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">银行卡号</label>
            <div className="relative">
              <input value={bankCardNo} onChange={(e) => setBankCardNo(e.target.value)} placeholder="请输入银行卡号"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
        <button onClick={handleWithdraw} disabled={submitting || !amount || !bankCardNo || !bankName}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition">
          {submitting ? <Loader2 className="animate-spin inline" size={16} /> : '提交提现'}
        </button>
      </div>

      {/* Withdraw history */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">提现记录</h2>
          <select value={statusFilter} onChange={(e) => handleStatusFilterChange(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs">
            <option value="">全部状态</option>
            <option value="pending_first_review">待初审</option>
            <option value="pending_second_review">待复审</option>
            <option value="approved">已通过</option>
            <option value="paid">已到账</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">金额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">银行卡</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">拒绝原因</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">到账时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">暂无提现记录</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-600">{r.id}</td>
                    <td className="px-4 py-3 text-sm font-medium">¥{Number(r.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {r.bankName ? `${r.bankName}(${r.bankCardNo ? r.bankCardNo.slice(-4) : '****'})` : '-'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{r.rejectReason || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{r.paidAt ? new Date(r.paidAt).toLocaleString('zh-CN') : '-'}</td>
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
