import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2, AlertCircle, RefreshCw, FileText, Plus, X,
  CheckCircle2, DollarSign,
} from 'lucide-react'

// ── Types ──

interface InvoiceItem {
  id: number
  amount: string
  invoiceType: string
  title: string
  taxId: string | null
  bankInfo: string | null
  status: string
  reason: string | null
  createdAt: string
}

interface InvoicesData {
  list: InvoiceItem[]
  total: number
  availableAmount: string
}

const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  issued: '已开票',
  rejected: '已拒绝',
}

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  issued: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const invoiceTypeLabel: Record<string, string> = {
  normal: '普票',
  special: '专票',
}

// ════════════════════════════════════════════

// ── 发票管理（用户端）─-
//
// 【业务说明】
//   用户申请开票，需先有已审核通过的充值记录。
//   显示可开票额度（= 累计已审核充值金额），申请金额不可超此额度。
//   支持按状态筛选（全部/待审核/已通过/已开票/已拒绝）。
//
// 【状态流转】pending → approved → issued | rejected
// 【前置条件】amount ≤ 累计已审核充值金额
// 【权限要求】登录即可申请
// 【数据来源】GET /api/v1/invoices, POST /api/v1/invoices, GET /api/v1/invoices/available-amount

export default function UserInvoices() {
  const [list, setList] = useState<InvoiceItem[]>([])
  const [total, setTotal] = useState(0)
  const [availableAmount, setAvailableAmount] = useState('0.00')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, any> = { page, pageSize }
      if (statusFilter !== 'all') params.status = statusFilter
      const [invoices, avail] = await Promise.all([
        get<{ list: InvoiceItem[]; total: number }>('/api/v1/invoices', params),
        get<{ availableAmount: string }>('/api/v1/invoices/available-amount'),
      ])
      setList(invoices.list || [])
      setTotal(invoices.total || 0)
      setAvailableAmount(avail.availableAmount || '0.00')
    } catch (err: any) {
      setError(err.message || '获取发票数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText size={28} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">发票管理</h1>
      </div>

      {/* Available amount card */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-sm p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-indigo-100">可开票额度</p>
            <p className="text-3xl font-bold mt-1">¥ {Number(availableAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-indigo-200 mt-1">累计充值金额 - 已开票金额</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={parseFloat(availableAmount) <= 0}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-indigo-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> 申请开票
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Invoice list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-800">开票记录</h2>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="issued">已开票</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-slate-400">暂无开票记录</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 font-medium text-slate-500">ID</th>
                    <th className="px-6 py-3 font-medium text-slate-500 text-right">金额</th>
                    <th className="px-6 py-3 font-medium text-slate-500">类型</th>
                    <th className="px-6 py-3 font-medium text-slate-500">抬头</th>
                    <th className="px-6 py-3 font-medium text-slate-500">状态</th>
                    <th className="px-6 py-3 font-medium text-slate-500">提交时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">#{item.id}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">¥{Number(item.amount).toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-600">{invoiceTypeLabel[item.invoiceType] || item.invoiceType}</td>
                      <td className="px-6 py-4 text-slate-700 max-w-[160px] truncate" title={item.title}>{item.title}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[item.status] || 'bg-slate-100 text-slate-600'}`}>
                          {statusLabel[item.status] || item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <PaginationBar
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={() => {}}
                total={total}
                totalPages={totalPages}
              />
            )}
          </>
        )}
      </div>

      {/* Apply invoice modal */}
      {showModal && (
        <ApplyInvoiceModal
          availableAmount={availableAmount}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════
//  Apply invoice modal
// ════════════════════════════════════════════

function ApplyInvoiceModal({
  availableAmount,
  onClose,
  onSuccess,
}: {
  availableAmount: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [invoiceType, setInvoiceType] = useState('normal')
  const [title, setTitle] = useState('')
  const [taxId, setTaxId] = useState('')
  const [bankInfo, setBankInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const maxAmount = parseFloat(availableAmount)

  const handleSubmit = async () => {
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('请输入有效金额'); return }
    if (amt > maxAmount) { setError(`申请金额不能超过可开票额度 (¥${maxAmount.toFixed(2)})`); return }
    if (!title.trim()) { setError('请填写发票抬头'); return }
    if (invoiceType === 'special' && !taxId.trim()) { setError('专票请填写税号'); return }

    setSaving(true)
    try {
      await post('/api/v1/invoices', {
        amount: amt,
        invoiceType,
        title: title.trim(),
        taxId: taxId.trim() || undefined,
        bankInfo: bankInfo.trim() || undefined,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '申请开票失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">申请开票</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-700">
            可开票额度：<strong>¥{maxAmount.toFixed(2)}</strong>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">发票类型</label>
            <select
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="normal">普票</option>
              <option value="special">专票</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">金额 <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-sm">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min={0.01}
                max={maxAmount}
                step={0.01}
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">发票抬头 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="公司名称或个人姓名"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">税号 {invoiceType === 'special' && <span className="text-red-500">*</span>}</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="统一社会信用代码"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">银行信息</label>
            <input
              type="text"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              placeholder="开户行及账号（选填）"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '提交中...' : '提交申请'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
